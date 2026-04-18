import { describe, it, expect } from 'vitest';
import {
  computeFill,
  normalizePlate,
  normalizeDriverName,
  similarity,
  formatConfirmation,
  type PreviousFill,
} from '@/lib/diesel-calc';

// Helper: build a synthetic fill history newest-first
function fill(partial: Partial<PreviousFill> & { odometer_km: number; l100?: number | null; ageDays?: number }): PreviousFill {
  const ageMs = (partial.ageDays ?? 1) * 86_400_000;
  return {
    id: partial.id ?? `f-${Math.random().toString(36).slice(2, 8)}`,
    odometer_km: partial.odometer_km,
    liters_per_100km: partial.l100 ?? 15,
    logged_at: new Date(Date.now() - ageMs).toISOString(),
  };
}

describe('diesel-calc / computeFill', () => {
  it('returns first-fill marker when no history', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_000, litersFilled: 50, pricePerLiter: 4.5 },
      [],
      [],
      null
    );
    expect(result.anomalies).toContain('first_fill_for_truck');
    expect(result.kmSinceLast).toBeNull();
    expect(result.flagged).toBe(false);
    expect(result.costAed).toBe(225);  // 50 * 4.5
  });

  it('HARD REJECTS odometer regression (>1km backwards)', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 90_000, litersFilled: 50, pricePerLiter: 4.5 },
      [fill({ odometer_km: 100_000, l100: 15, ageDays: 2 })],
      [],
      15
    );
    expect(result.hardReject).toBe(true);
    expect(result.hardRejectReason).toMatch(/Odometer cannot decrease/i);
    expect(result.anomalies).toContain('odometer_regression');
  });

  it('tolerates 1km OCR noise on odometer (does NOT hard-reject)', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 99_999.5, litersFilled: 50, pricePerLiter: 4.5 },
      [fill({ odometer_km: 100_000, l100: 15, ageDays: 2 })],
      [],
      15
    );
    expect(result.hardReject).toBe(false);
    // km_since_last clamps to >= 0
    expect(result.kmSinceLast).toBe(0);
  });

  it('computes L/100km correctly', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_500, litersFilled: 60, pricePerLiter: 4.5 },
      [fill({ odometer_km: 100_000, l100: 15, ageDays: 2 })],
      [],
      15
    );
    // 60L over 500km = 12 L/100km
    expect(result.litersPer100km).toBe(12);
    expect(result.kmSinceLast).toBe(500);
    expect(result.costAed).toBe(270);  // 60 * 4.5
  });

  it('computes driver rolling avg across any truck', () => {
    const driverHistory = [
      fill({ odometer_km: 50_000, l100: 16, ageDays: 1 }),
      fill({ odometer_km: 45_000, l100: 14, ageDays: 3 }),
      fill({ odometer_km: 40_000, l100: 15, ageDays: 5 }),
    ];
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_500, litersFilled: 60, pricePerLiter: 4.5 },
      [fill({ odometer_km: 100_000, l100: 15, ageDays: 2 })],
      driverHistory,
      null
    );
    expect(result.driverRollingAvg).toBe(15);  // (16+14+15)/3
  });

  it('flags >30% above truck rolling avg when enough history', () => {
    // Build 6 fills of ~10 L/100km for this truck
    const history: PreviousFill[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(fill({ odometer_km: 100_000 - i * 500, l100: 10, ageDays: i + 1 }));
    }
    // Submit a fill with 15 L/100km = 50% above truck avg → must flag
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_500, litersFilled: 75, pricePerLiter: 4.5 },
      history,
      [],
      null
    );
    expect(result.litersPer100km).toBe(15);
    expect(result.flagged).toBe(true);
    expect(result.baselineUsed).toBe('truck');
    expect(result.variancePercent).toBeGreaterThan(30);
  });

  it('does NOT flag when truck has too little history (even if big variance)', () => {
    // Only 3 fills — below minFillsBeforeFlagging (5)
    const history: PreviousFill[] = [
      fill({ odometer_km: 99_500, l100: 10, ageDays: 2 }),
      fill({ odometer_km: 99_000, l100: 10, ageDays: 4 }),
      fill({ odometer_km: 98_500, l100: 10, ageDays: 6 }),
    ];
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_500, litersFilled: 150, pricePerLiter: 4.5 },
      history,
      [],
      null
    );
    // 150L over 1000km = 15 L/100km, but too few historical fills to trust baseline
    // HOWEVER — 15 L/100km is within plausible range, so no implausible auto-flag
    expect(result.flagged).toBe(false);
  });

  it('auto-flags physically implausible L/100km (OCR error safeguard)', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_010, litersFilled: 50, pricePerLiter: 4.5 },
      [fill({ odometer_km: 100_000, l100: 15, ageDays: 1 })],
      [],
      15
    );
    // 50L in 10km = 500 L/100km → definitely OCR error or missed fill
    expect(result.flagged).toBe(true);
    expect(result.anomalies.some((a) => a.startsWith('implausible_l100'))).toBe(true);
  });

  it('costAed is null when price not provided', () => {
    const result = computeFill(
      { truckId: 't1', odometerKm: 100_000, litersFilled: 50 },
      [],
      [],
      null
    );
    expect(result.costAed).toBeNull();
  });
});

describe('diesel-calc / normalization + similarity', () => {
  it('normalizes plates aggressively', () => {
    expect(normalizePlate('AJM-A-12345')).toBe('AJMA12345');
    expect(normalizePlate('ajm a 12345')).toBe('AJMA12345');
    expect(normalizePlate('  ajm/a/12345  ')).toBe('AJMA12345');
  });

  it('normalizes driver names', () => {
    expect(normalizeDriverName('Ahmad Hassan')).toBe('ahmad hassan');
    expect(normalizeDriverName('  AHMAD-HASSAN  ')).toBe('ahmadhassan');
    expect(normalizeDriverName('Ahmad  Hassan')).toBe('ahmad hassan');
  });

  it('similarity returns 1 for identical strings', () => {
    expect(similarity('ahmad hassan', 'ahmad hassan')).toBe(1);
  });

  it('similarity detects near-duplicates above 0.85', () => {
    // one typo in 12 chars
    expect(similarity('ahmad hassan', 'ahmed hassan')).toBeGreaterThan(0.85);
  });

  it('similarity is low for different strings', () => {
    expect(similarity('ahmad hassan', 'mohammed ali')).toBeLessThan(0.5);
  });
});

describe('diesel-calc / formatConfirmation', () => {
  it('formats happy-path confirmation', () => {
    const msg = formatConfirmation('AJM-A-12345', 'Ahmad Hassan', 45, 320, 14.1, false, 2);
    expect(msg).toContain('Truck AJM-A-12345');
    expect(msg).toContain('Ahmad Hassan');
    expect(msg).toContain('45L');
    expect(msg).toContain('320km');
    expect(msg).toContain('14.1 L/100km');
    expect(msg).toContain('✓');
  });

  it('formats flagged confirmation with variance', () => {
    const msg = formatConfirmation('AJM-A-12345', 'Ahmad', 80, 200, 40, true, 45);
    expect(msg).toContain('🚨');
    expect(msg).toContain('+45%');
  });

  it('omits driver cleanly when unknown', () => {
    const msg = formatConfirmation('AJM-A-12345', null, 45, 320, 14.1, false, null);
    expect(msg).toContain('Truck AJM-A-12345');
    expect(msg).not.toContain('— —');  // no empty driver bit
  });
});
