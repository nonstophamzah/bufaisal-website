// ============================================================
// Diesel Tracker — Client-side API wrapper
// ============================================================
// Thin wrapper around /api/diesel. Keeps component code clean.
// ============================================================

export type TruckRow = {
  id: string;
  plate_number: string;
  plate_display: string;
  nickname: string | null;
  needs_review?: boolean;
};

export type DriverRow = {
  id: string;
  full_name: string;
  name_normalized: string;
  license_number: string | null;
  nickname: string | null;
  needs_review?: boolean;
};

export type SubmitFillInput = {
  // Identify truck: either truck_id (preferred if known) OR plate_raw (auto-resolve/create)
  truck_id?: string;
  plate_raw?: string;
  plate_display?: string;

  // Identify driver: either driver_id (preferred) OR driver_name + optional license_number
  driver_id?: string;
  driver_name?: string;
  driver_license_number?: string;

  odometer_km: number;
  liters_filled: number;
  price_per_liter?: number | null;   // if omitted, server uses config default

  photo_plate_url: string;
  photo_license_url?: string | null;
  photo_odometer_url: string;
  photo_pump_url: string;

  submitted_by_name?: string;
  submitted_by_phone?: string;
  submitted_via?: 'web_form' | 'whatsapp' | 'manual';
  corrected_by_human?: boolean;

  gemini_confidence_plate?: number | null;
  gemini_confidence_odo?: number | null;
  gemini_confidence_pump?: number | null;
  gemini_confidence_license?: number | null;
  gemini_raw?: unknown;
};

export type ComputedResult = {
  km_since_last: number | null;
  liters_per_100km: number | null;
  truck_rolling_avg_l100: number | null;
  driver_rolling_avg_l100: number | null;
  fleet_avg_l100: number | null;
  variance_percent: number | null;
  baseline_used: 'truck' | 'driver' | 'fleet' | null;
  flagged: boolean;
  flag_reason: string | null;
  anomalies: string[];
  cost_aed: number | null;
  price_per_liter: number | null;
};

export type SubmitFillResponse = {
  success: true;
  fill_id: string;
  confirmation: string;
  truck: { id: string; plate_display: string; needs_review: boolean };
  driver: { id: string; full_name: string; needs_review: boolean } | null;
  match_info: { plate_match: string | null; driver_match: string | null };
  computed: ComputedResult;
};

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/diesel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    // attach extra info (e.g. ambiguous candidates) for caller to branch on
    (err as Error & { payload?: unknown }).payload = data;
    throw err;
  }
  return data as T;
}

export async function checkPin(pin: string): Promise<boolean> {
  try {
    await post({ action: 'check_pin', pin });
    return true;
  } catch {
    return false;
  }
}

export async function listTrucks(): Promise<TruckRow[]> {
  const { trucks } = await post<{ trucks: TruckRow[] }>({ action: 'list_trucks' });
  return trucks;
}

export async function listDrivers(): Promise<DriverRow[]> {
  const { drivers } = await post<{ drivers: DriverRow[] }>({ action: 'list_drivers' });
  return drivers;
}

export async function resolvePlate(plate: string): Promise<{
  truck: TruckRow | null;
  match: 'exact' | 'digits_fuzzy' | 'levenshtein' | 'ambiguous' | 'none';
  candidates?: TruckRow[];
}> {
  return post({ action: 'resolve_plate', plate });
}

export async function resolveDriver(input: {
  name?: string | null;
  license_number?: string | null;
}): Promise<{
  driver: DriverRow | null;
  match: 'matched' | 'none';
  score?: number;
}> {
  return post({ action: 'resolve_driver', ...input });
}

export async function submitFill(input: SubmitFillInput): Promise<SubmitFillResponse> {
  return post<SubmitFillResponse>({ action: 'submit_fill', ...input });
}

export type RecentFillRow = {
  id: string;
  logged_at: string;
  odometer_km: number;
  liters_filled: number;
  km_since_last: number | null;
  liters_per_100km: number | null;
  price_per_liter_at_fill: number | null;
  cost_aed: number | null;
  truck_rolling_avg_l100: number | null;
  driver_rolling_avg_l100: number | null;
  fleet_avg_l100_at_time: number | null;
  variance_percent: number | null;
  flagged: boolean;
  flag_reason: string | null;
  photo_plate_url: string;
  photo_license_url: string | null;
  photo_odometer_url: string;
  photo_pump_url: string;
  corrected_by_human: boolean;
  submitted_by_name: string | null;
  truck: { id: string; plate_display: string; nickname: string | null; needs_review: boolean } | null;
  driver: { id: string; full_name: string; nickname: string | null; needs_review: boolean } | null;
};

export async function recentFills(limit = 50): Promise<RecentFillRow[]> {
  const { fills } = await post<{ fills: RecentFillRow[] }>({
    action: 'recent_fills',
    limit,
  });
  return fills;
}

// ============================================================
// Dashboard actions (Pass 2)
// ============================================================

export async function checkManagerPin(pin: string): Promise<{ ok: boolean; using_fallback_pin?: boolean; sheets_configured?: boolean }> {
  try {
    const r = await post<{ success: true; using_fallback_pin: boolean; sheets_configured: boolean }>({
      action: 'check_manager_pin', pin,
    });
    return { ok: true, using_fallback_pin: r.using_fallback_pin, sheets_configured: r.sheets_configured };
  } catch {
    return { ok: false };
  }
}

export type TruckStatsRow = {
  truck_id: string;
  plate_number: string;
  plate_display: string;
  nickname: string | null;
  active: boolean;
  needs_review: boolean;
  total_fills: number;
  last_fill_at: string | null;
  avg_l100_alltime: number | null;
  avg_l100_last10: number | null;
  flag_count: number;
  total_liters: number | null;
  total_cost_aed: number | null;
};
export type DriverStatsRow = {
  driver_id: string;
  full_name: string;
  name_normalized: string;
  nickname: string | null;
  active: boolean;
  needs_review: boolean;
  total_fills: number;
  last_fill_at: string | null;
  avg_l100_alltime: number | null;
  avg_l100_last10: number | null;
  flag_count: number;
  total_liters: number | null;
  total_cost_aed: number | null;
};
export type NeedsReviewTruck = {
  id: string;
  plate_number: string;
  plate_display: string;
  nickname: string | null;
  created_at: string;
};
export type NeedsReviewDriver = {
  id: string;
  full_name: string;
  name_normalized: string;
  license_number: string | null;
  nickname: string | null;
  created_at: string;
};
export type DashboardFillRow = {
  id: string;
  logged_at: string;
  odometer_km: number;
  liters_filled: number;
  km_since_last: number | null;
  liters_per_100km: number | null;
  cost_aed: number | null;
  variance_percent: number | null;
  flagged: boolean;
  flag_reason: string | null;
  photo_plate_url?: string;
  photo_license_url?: string | null;
  photo_odometer_url?: string;
  photo_pump_url?: string;
  truck: { id: string; plate_display: string; nickname: string | null } | null;
  driver: { id: string; full_name: string; nickname: string | null } | null;
};
export type DashboardWindow = 'today' | 'week' | 'month' | 'quarter' | 'all';
export type DashboardTotals = {
  fills: number;
  liters: number;
  cost_aed: number;
  flagged: number;
};
export type DashboardSnapshot = {
  window: DashboardWindow;
  since: string | null;
  today: DashboardFillRow[];
  trucks: TruckStatsRow[];
  drivers: DriverStatsRow[];
  flagged: DashboardFillRow[];
  needs_review: { trucks: NeedsReviewTruck[]; drivers: NeedsReviewDriver[] };
  fleet_avg_l100: number | null;
  totals: DashboardTotals;
  sheets_configured: boolean;
};

export async function dashboardSnapshot(window: DashboardWindow = 'all'): Promise<DashboardSnapshot> {
  return post<DashboardSnapshot>({ action: 'dashboard_snapshot', window });
}

// -------- Per-vehicle drill-down --------

export type TruckDetail = {
  window: DashboardWindow;
  since: string | null;
  truck: {
    id: string;
    plate_number: string;
    plate_display: string;
    nickname: string | null;
    active: boolean;
    needs_review: boolean;
    notes: string | null;
    created_at: string;
  };
  stats: {
    total_fills: number;
    total_liters: number;
    total_cost_aed: number;
    avg_l100: number | null;
    flag_count: number;
  };
  driver_mix: Array<{ driver_id: string; name: string; fills: number; liters: number; avg_l100: number | null }>;
  fills: Array<{
    id: string;
    logged_at: string;
    odometer_km: number | null;
    liters_filled: number | null;
    km_since_last: number | null;
    liters_per_100km: number | null;
    cost_aed: number | null;
    price_per_liter_at_fill: number | null;
    variance_percent: number | null;
    flagged: boolean;
    flag_reason: string | null;
    photo_plate_url: string | null;
    photo_license_url: string | null;
    photo_odometer_url: string | null;
    photo_pump_url: string | null;
    driver: { id: string; full_name: string; nickname: string | null } | null;
  }>;
};

export async function truckDetail(id: string, window: DashboardWindow = 'all'): Promise<TruckDetail> {
  return post<TruckDetail>({ action: 'truck_detail', id, window });
}

export type DriverDetail = {
  window: DashboardWindow;
  since: string | null;
  driver: {
    id: string;
    full_name: string;
    name_normalized: string;
    nickname: string | null;
    license_number: string | null;
    active: boolean;
    needs_review: boolean;
    notes: string | null;
    created_at: string;
  };
  stats: TruckDetail['stats'];
  truck_mix: Array<{ truck_id: string; plate: string; fills: number; liters: number; avg_l100: number | null }>;
  fills: Array<TruckDetail['fills'][number] & { truck: { id: string; plate_display: string; nickname: string | null } | null }>;
};

export async function driverDetail(id: string, window: DashboardWindow = 'all'): Promise<DriverDetail> {
  return post<DriverDetail>({ action: 'driver_detail', id, window });
}

// -------- Sheets format init --------

export async function initSheetsFormat(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await post<{ success: true }>({ action: 'init_sheets_format' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

// -------- CSV generation (client-side from already-loaded data) --------

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return header + '\n' + body;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type FullLogRow = RecentFillRow & {
  truck: { id: string; plate_display: string; nickname: string | null; needs_review: boolean } | null;
  driver: { id: string; full_name: string; nickname: string | null; needs_review: boolean } | null;
};

export async function fullLog(params: {
  limit?: number;
  offset?: number;
  truck_id?: string;
  driver_id?: string;
  flagged_only?: boolean;
  since?: string;
}): Promise<{ fills: FullLogRow[]; total: number }> {
  return post({ action: 'full_log', ...params });
}

export type TrendPoint = { date: string; fills: number; liters: number; cost_aed: number; avg_l100: number | null; flagged: number };
export async function trendsData(days = 30): Promise<{ days: number; series: TrendPoint[] }> {
  return post({ action: 'trends_data', days });
}

export type ReportResult = {
  window: 'report_daily' | 'report_weekly' | 'report_monthly';
  window_days: number;
  since: string;
  total_fills: number;
  total_liters: number;
  total_cost_aed: number;
  fleet_avg_l100: number | null;
  flag_count: number;
  worst_trucks: Array<{ truck_id: string; plate: string; fills: number; liters: number; avg_l100: number | null; flagged: number }>;
  worst_drivers: Array<{ driver_id: string; name: string; fills: number; liters: number; avg_l100: number | null; flagged: number }>;
  anomalies: Array<{ id: string; logged_at: string; plate: string | null; driver: string | null; l100: number | null; variance_pct: number | null; reason: string | null }>;
};
export async function report(kind: 'daily' | 'weekly' | 'monthly'): Promise<ReportResult> {
  return post<ReportResult>({ action: `report_${kind}` });
}

export async function editTruck(id: string, patch: {
  plate_display?: string; plate_number?: string; nickname?: string | null;
  active?: boolean; needs_review?: boolean; notes?: string | null;
}): Promise<{ success: true; truck: TruckRow & { active: boolean; notes: string | null } }> {
  return post({ action: 'edit_truck', id, ...patch });
}

export async function editDriver(id: string, patch: {
  full_name?: string; nickname?: string | null; license_number?: string | null;
  active?: boolean; needs_review?: boolean; notes?: string | null;
}): Promise<{ success: true; driver: DriverRow & { active: boolean; notes: string | null } }> {
  return post({ action: 'edit_driver', id, ...patch });
}

export async function mergeTrucks(fromId: string, toId: string): Promise<{ success: true; fills_moved: number }> {
  return post({ action: 'merge_trucks', from_id: fromId, to_id: toId });
}
export async function mergeDrivers(fromId: string, toId: string): Promise<{ success: true; fills_moved: number }> {
  return post({ action: 'merge_drivers', from_id: fromId, to_id: toId });
}

// ============================================================
// Gemini OCR helpers (call existing /api/gemini)
// ============================================================
type GeminiAction = 'diesel_plate' | 'diesel_odometer' | 'diesel_pump' | 'diesel_license';

export async function callGemini<T>(
  action: GeminiAction,
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<T & { _raw: unknown }> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, imageBase64, mimeType }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Gemini failed');
  const match = String(data.text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no JSON');
  const parsed = JSON.parse(match[0]) as T;
  return { ...parsed, _raw: data.text };
}

export type PlateResult = {
  plate_number: string | null;
  plate_digits: string | null;
  confidence: number;
  readable: boolean;
};
export type OdoResult = {
  odometer_km: number | null;
  confidence: number;
  readable: boolean;
  notes?: string;
};
export type PumpResult = {
  liters: number | null;
  amount_aed: number | null;
  confidence: number;
  readable: boolean;
  notes?: string;
};
export type LicenseResult = {
  full_name: string | null;
  full_name_arabic: string | null;
  license_number: string | null;
  nationality: string | null;
  expiry_date: string | null;
  confidence: number;
  readable: boolean;
  notes?: string;
};

// Run all 4 OCR calls in parallel given base64 images
export async function analyzeAll(inputs: {
  plate:   { base64: string; mime: string };
  license: { base64: string; mime: string };
  odo:     { base64: string; mime: string };
  pump:    { base64: string; mime: string };
}) {
  const [plate, license, odo, pump] = await Promise.all([
    callGemini<PlateResult>('diesel_plate', inputs.plate.base64, inputs.plate.mime),
    callGemini<LicenseResult>('diesel_license', inputs.license.base64, inputs.license.mime),
    callGemini<OdoResult>('diesel_odometer', inputs.odo.base64, inputs.odo.mime),
    callGemini<PumpResult>('diesel_pump', inputs.pump.base64, inputs.pump.mime),
  ]);
  return { plate, license, odo, pump };
}
