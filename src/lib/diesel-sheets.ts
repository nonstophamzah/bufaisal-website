// ============================================================
// Diesel Tracker — Google Sheets real-time backup
// ============================================================
// Feature-flagged. If the required env vars aren't present, syncFill() is a
// no-op and submit_fill proceeds normally. This keeps the core flow alive
// even when Sheets is misconfigured / Google is down.
//
// Env vars required (all three):
//   DIESEL_SHEETS_CLIENT_EMAIL     — service account email
//   DIESEL_SHEETS_PRIVATE_KEY      — service account private key (PEM, can contain \n)
//   DIESEL_SHEETS_SPREADSHEET_ID   — target spreadsheet ID (from its URL)
// Optional:
//   DIESEL_SHEETS_TAB_NAME         — defaults to "Fills"
//
// See DIESEL-DEPLOY-STEPS.md (Pass 2 section) for the Google Cloud setup steps.
//
// Sync philosophy:
//   * Fire-and-forget from the API: we do NOT await this. If it fails, the
//     Supabase write has already committed (source of truth intact).
//   * We log sync failures to diesel_audit_log so the manager can spot them.
//   * If the sheet is missing a header row, we write one on first call.
// ============================================================

import { JWT } from 'google-auth-library';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export type SheetsFillRow = {
  date: string;           // YYYY-MM-DD
  time: string;           // HH:mm
  truck_plate: string;
  driver: string;
  odometer: number | null;
  liters: number | null;
  km_driven: number | null;
  l_per_100km: number | null;
  cost_aed: number | null;
  fleet_avg: number | null;
  variance_pct: number | null;
  flagged: 'Y' | 'N';
  flag_reason: string | null;
  plate_photo_url: string | null;
  license_photo_url: string | null;
  odo_photo_url: string | null;
  pump_photo_url: string | null;
};

const HEADERS: readonly string[] = [
  'Date', 'Time', 'Truck Plate', 'Driver', 'Odometer', 'Liters',
  'KM Driven', 'L/100km', 'Cost AED', 'Fleet Avg', 'Variance %',
  'Flagged', 'Flag Reason',
  'Plate Photo', 'Licence Photo', 'Odometer Photo', 'Pump Photo',
];

function envConfig() {
  const clientEmail = process.env.DIESEL_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey  = process.env.DIESEL_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const sheetId     = process.env.DIESEL_SHEETS_SPREADSHEET_ID?.trim();
  const tabName     = (process.env.DIESEL_SHEETS_TAB_NAME || 'Fills').trim();
  if (!clientEmail || !privateKey || !sheetId) return null;
  return { clientEmail, privateKey, sheetId, tabName };
}

export function isSheetsConfigured(): boolean {
  return envConfig() !== null;
}

async function getAuthToken(cfg: NonNullable<ReturnType<typeof envConfig>>): Promise<string> {
  const jwt = new JWT({
    email: cfg.clientEmail,
    key: cfg.privateKey,
    scopes: [SCOPE],
  });
  const { access_token } = await jwt.authorize();
  if (!access_token) throw new Error('Google auth returned no access_token');
  return access_token;
}

async function sheetsFetch<T = unknown>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${SHEETS_API_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function ensureHeaderRow(token: string, sheetId: string, tab: string) {
  // Read the first row of the tab; if empty, write headers.
  const range = encodeURIComponent(`${tab}!A1:Z1`);
  const got = await sheetsFetch<{ values?: string[][] }>(
    token,
    `${sheetId}/values/${range}`
  );
  const firstRow = got.values?.[0] ?? [];
  if (firstRow.length === 0) {
    await sheetsFetch(
      token,
      `${sheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ range: `${tab}!A1:Z1`, values: [HEADERS.slice()] }),
      }
    );
  }
}

function toRow(row: SheetsFillRow): (string | number)[] {
  const nz = (v: unknown) => (v === null || v === undefined ? '' : (v as string | number));
  return [
    row.date,
    row.time,
    row.truck_plate,
    row.driver,
    nz(row.odometer),
    nz(row.liters),
    nz(row.km_driven),
    nz(row.l_per_100km),
    nz(row.cost_aed),
    nz(row.fleet_avg),
    nz(row.variance_pct),
    row.flagged,
    nz(row.flag_reason),
    nz(row.plate_photo_url),
    nz(row.license_photo_url),
    nz(row.odo_photo_url),
    nz(row.pump_photo_url),
  ];
}

/**
 * Append one fill row to the configured Sheet. No-op if unconfigured.
 * Never throws; errors are logged to diesel_audit_log.
 */
export async function syncFillToSheet(row: SheetsFillRow, fillId?: string): Promise<void> {
  const cfg = envConfig();
  if (!cfg) return;

  try {
    const token = await getAuthToken(cfg);
    await ensureHeaderRow(token, cfg.sheetId, cfg.tabName);
    const range = encodeURIComponent(`${cfg.tabName}!A1`);
    await sheetsFetch(
      token,
      `${cfg.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ values: [toRow(row)] }),
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await supabaseAdmin.from('diesel_audit_log').insert({
        action: 'sheets_sync_failed',
        target_id: fillId ?? null,
        details: { error: msg.slice(0, 1000), row },
      });
    } catch {
      // last-resort: swallow
    }
  }
}

/**
 * Helper: build a SheetsFillRow from insert-time values. Called by the API
 * right after the Supabase insert succeeds, before firing syncFillToSheet.
 */
export function buildSheetRow(input: {
  loggedAt: string;          // ISO timestamp
  truckPlate: string;
  driverName: string | null;
  odometerKm: number | null;
  litersFilled: number | null;
  kmSinceLast: number | null;
  litersPer100km: number | null;
  costAed: number | null;
  fleetAvg: number | null;
  variancePct: number | null;
  flagged: boolean;
  flagReason: string | null;
  photoPlateUrl: string | null;
  photoLicenseUrl: string | null;
  photoOdoUrl: string | null;
  photoPumpUrl: string | null;
}): SheetsFillRow {
  const dt = new Date(input.loggedAt);
  // Dubai timezone — no need for TZ library; use plain locale with timeZone option
  const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });   // YYYY-MM-DD
  const timeStr = dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' });
  return {
    date: dateStr,
    time: timeStr,
    truck_plate: input.truckPlate,
    driver: input.driverName ?? '',
    odometer: input.odometerKm,
    liters: input.litersFilled,
    km_driven: input.kmSinceLast,
    l_per_100km: input.litersPer100km,
    cost_aed: input.costAed,
    fleet_avg: input.fleetAvg,
    variance_pct: input.variancePct,
    flagged: input.flagged ? 'Y' : 'N',
    flag_reason: input.flagReason,
    plate_photo_url: input.photoPlateUrl,
    license_photo_url: input.photoLicenseUrl,
    odo_photo_url: input.photoOdoUrl,
    pump_photo_url: input.photoPumpUrl,
  };
}
