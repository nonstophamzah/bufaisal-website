// ============================================================
// Diesel Tracker — Calculation Engine
// ============================================================
// Pure functions. No side effects. Unit-testable.
// Called from /api/diesel/route.ts submit_fill handler.
// ============================================================

export type FillInput = {
  truckId: string;
  driverId?: string | null;
  odometerKm: number;
  litersFilled: number;
  pricePerLiter?: number | null;   // AED per liter (snapshot)
};

export type PreviousFill = {
  id: string;
  odometer_km: number;
  liters_per_100km: number | null;
  logged_at: string;
};

export type CalcResult = {
  previousFillId: string | null;
  kmSinceLast: number | null;
  litersPer100km: number | null;
  truckRollingAvg: number | null;   // avg of this truck's last N valid fills (excluding this one)
  driverRollingAvg: number | null;  // avg of this driver's last N valid fills (any truck)
  fleetAvg: number | null;          // fleet-wide avg (passed in)
  variancePercent: number | null;   // vs truckRollingAvg if available, else fleetAvg
  baselineUsed: 'truck' | 'driver' | 'fleet' | null;
  flagged: boolean;
  flagReason: string | null;
  hardReject: boolean;              // true if API must 400 and NOT insert (e.g. odometer regression)
  hardRejectReason: string | null;
  anomalies: string[];              // non-flag warnings: "long gap", "first fill", etc.
  costAed: number | null;           // liters * price_per_liter (snapshot), null if no price
};

export type CalcConfig = {
  varianceFlagThresholdPct: number;   // e.g. 30
  minFillsBeforeFlagging: number;     // e.g. 5 — don't flag until truck has this many fills
  rollingWindowFills: number;         // e.g. 10
  maxKmBetweenFills: number;          // e.g. 5000 — anomaly: probably missed a fill
  maxDaysBetweenFills: number;        // e.g. 30
  maxKmPerDay: number;                // e.g. 1200 — plausibility cap for km/day
};

export const DEFAULT_CALC_CONFIG: CalcConfig = {
  varianceFlagThresholdPct: 30,
  minFillsBeforeFlagging: 5,
  rollingWindowFills: 10,
  maxKmBetweenFills: 5000,
  maxDaysBetweenFills: 30,
  maxKmPerDay: 1200,
};

/**
 * Calculate all derived fields for a new fill given history.
 *
 * @param input          The new fill
 * @param truckHistory   This truck's previous fills, newest-first, up to rollingWindow+1 rows
 * @param driverHistory  This driver's previous fills, newest-first, up to rollingWindow rows (optional)
 * @param fleetAvg       Current fleet rolling avg L/100km (null if no data yet)
 * @param config         Thresholds
 */
export function computeFill(
  input: FillInput,
  truckHistory: PreviousFill[],
  driverHistory: PreviousFill[],
  fleetAvg: number | null,
  config: CalcConfig = DEFAULT_CALC_CONFIG
): CalcResult {
  const anomalies: string[] = [];
  const prev = truckHistory[0] ?? null;

  // Cost snapshot (regardless of the other calcs)
  const costAed =
    input.pricePerLiter != null && Number.isFinite(input.pricePerLiter)
      ? round2(input.litersFilled * input.pricePerLiter)
      : null;

  // --- First fill ever for this truck ---
  if (!prev) {
    const driverRolling = computeRollingAvg(driverHistory, config.rollingWindowFills);
    return {
      previousFillId: null,
      kmSinceLast: null,
      litersPer100km: null,
      truckRollingAvg: null,
      driverRollingAvg: driverRolling,
      fleetAvg,
      variancePercent: null,
      baselineUsed: null,
      flagged: false,
      flagReason: null,
      hardReject: false,
      hardRejectReason: null,
      anomalies: ['first_fill_for_truck'],
      costAed,
    };
  }

  // --- HARD REJECT: odometer must not go backwards ---
  // Small OCR noise (<= 1 km) is tolerated as same-day; beyond that = reject.
  const odoDelta = input.odometerKm - prev.odometer_km;
  if (odoDelta < -1) {
    return {
      previousFillId: prev.id,
      kmSinceLast: null,
      litersPer100km: null,
      truckRollingAvg: null,
      driverRollingAvg: computeRollingAvg(driverHistory, config.rollingWindowFills),
      fleetAvg,
      variancePercent: null,
      baselineUsed: null,
      flagged: true,
      flagReason: `Odometer decreased (${prev.odometer_km}km → ${input.odometerKm}km)`,
      hardReject: true,
      hardRejectReason:
        `Odometer cannot decrease. Previous fill: ${prev.odometer_km}km. ` +
        `Submitted: ${input.odometerKm}km. Recheck odometer photo.`,
      anomalies: ['odometer_regression'],
      costAed,
    };
  }

  const kmSinceLast = round1(Math.max(0, odoDelta));

  // --- Guard: same-odometer same-day (double-submit) ---
  if (kmSinceLast === 0) {
    anomalies.push('same_odometer_as_previous');
  }

  // --- Anomaly: gap too large (probably a missed fill) ---
  if (kmSinceLast > config.maxKmBetweenFills) {
    anomalies.push(`large_km_gap:${kmSinceLast}`);
  }
  const msSinceLast = Date.now() - new Date(prev.logged_at).getTime();
  const daysSinceLast = msSinceLast / 86_400_000;
  if (daysSinceLast > config.maxDaysBetweenFills) {
    anomalies.push(`long_time_gap:${Math.round(daysSinceLast)}d`);
  }

  // --- Anomaly: implausibly fast (km/day above fleet-wide physical limit) ---
  // Only meaningful when the gap is >= ~4 hours — short gaps give noisy rates.
  const hoursSinceLast = msSinceLast / 3_600_000;
  if (hoursSinceLast >= 4 && kmSinceLast > 0) {
    const kmPerDay = (kmSinceLast / Math.max(hoursSinceLast, 0.0001)) * 24;
    if (kmPerDay > config.maxKmPerDay) {
      anomalies.push(`implausible_km_per_day:${Math.round(kmPerDay)}`);
    }
  }

  // --- L/100km for this fill ---
  // If km=0 we can't compute without division by zero. Return null, non-flagged.
  let litersPer100km: number | null = null;
  if (kmSinceLast > 0) {
    litersPer100km = round2((input.litersFilled / kmSinceLast) * 100);
  }

  // --- Truck rolling avg (exclude this fill; use valid historical values only) ---
  const truckRollingAvg = computeRollingAvg(truckHistory, config.rollingWindowFills);

  // --- Driver rolling avg (excludes this fill; across any truck) ---
  const driverRollingAvg = computeRollingAvg(driverHistory, config.rollingWindowFills);

  // --- Variance: prefer truck's own baseline, then driver, then fleet ---
  let variancePercent: number | null = null;
  let baseline: number | null = null;
  let baselineUsed: CalcResult['baselineUsed'] = null;
  if (truckRollingAvg && litersPer100km) {
    baseline = truckRollingAvg;
    baselineUsed = 'truck';
  } else if (driverRollingAvg && litersPer100km) {
    baseline = driverRollingAvg;
    baselineUsed = 'driver';
  } else if (fleetAvg && litersPer100km) {
    baseline = fleetAvg;
    baselineUsed = 'fleet';
  }
  if (baseline && litersPer100km) {
    variancePercent = round2(((litersPer100km - baseline) / baseline) * 100);
  }

  // --- Flag decision ---
  // Truck baseline: flag only if enough history. Driver/fleet baseline: flag if over threshold.
  let flagged = false;
  let flagReason: string | null = null;
  const truckHistorySize = truckHistory
    .map((h) => h.liters_per_100km)
    .filter((x): x is number => typeof x === 'number' && x > 0).length;

  const readyToFlag =
    baselineUsed !== 'truck' || truckHistorySize >= config.minFillsBeforeFlagging;

  if (
    variancePercent !== null &&
    Math.abs(variancePercent) > config.varianceFlagThresholdPct &&
    readyToFlag
  ) {
    flagged = true;
    const direction = variancePercent > 0 ? 'above' : 'below';
    flagReason = `${Math.abs(Math.round(variancePercent))}% ${direction} ${baselineUsed} avg (${baseline}L/100km)`;
  }

  // --- Anomaly: physically implausible L/100km ---
  if (litersPer100km !== null && (litersPer100km < 3 || litersPer100km > 80)) {
    anomalies.push(`implausible_l100:${litersPer100km}`);
    // Auto-flag physically implausible readings (OCR error likely)
    if (!flagged) {
      flagged = true;
      flagReason = `Implausible ${litersPer100km}L/100km — likely OCR error or missed fill.`;
    }
  }

  return {
    previousFillId: prev.id,
    kmSinceLast,
    litersPer100km,
    truckRollingAvg,
    driverRollingAvg,
    fleetAvg,
    variancePercent,
    baselineUsed,
    flagged,
    flagReason,
    hardReject: false,
    hardRejectReason: null,
    anomalies,
    costAed,
  };
}

// ---------- helpers ----------
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeRollingAvg(history: PreviousFill[], window: number): number | null {
  const vals = history
    .slice(0, window)
    .map((h) => h.liters_per_100km)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  if (vals.length === 0) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ============================================================
// Fuzzy matching helpers (for plate + driver auto-create)
// ============================================================

/** Normalize a UAE plate: uppercase, strip spaces/dashes/non-alphanum. */
export function normalizePlate(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Normalize a driver name: lowercase, strip non-alphanumeric, collapse spaces. */
export function normalizeDriverName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ');
}

/** Levenshtein distance between two strings (iterative, O(n*m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,          // deletion
        curr[j - 1] + 1,      // insertion
        prev[j - 1] + cost    // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Similarity ratio 0..1 based on Levenshtein (1 = identical). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// ---------- formatting helpers for UI / WhatsApp ----------
export function formatConfirmation(
  plate: string,
  driverName: string | null,
  litersFilled: number,
  kmSinceLast: number | null,
  litersPer100km: number | null,
  flagged: boolean,
  variancePercent: number | null
): string {
  const driverBit = driverName ? ` — ${driverName}` : '';
  if (flagged && variancePercent !== null) {
    const sign = variancePercent > 0 ? '+' : '';
    return `🚨 Truck ${plate}${driverBit} — ${litersPer100km ?? '?'} L/100km — ${sign}${Math.round(variancePercent)}% vs avg`;
  }
  const kmStr = kmSinceLast !== null ? `${kmSinceLast}km` : 'first fill';
  const l100Str = litersPer100km !== null ? `${litersPer100km} L/100km` : '—';
  return `Truck ${plate}${driverBit} — ${litersFilled}L — ${kmStr} — ${l100Str} ✓`;
}
