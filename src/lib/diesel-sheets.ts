// ============================================================
// Diesel Tracker — Google Sheets real-time backup
// ============================================================
// Mirrors the 32 columns of public.diesel_fills 1:1. Feature-flagged.
// If the required env vars aren't present, syncFill() is a no-op and
// submit_fill proceeds normally.
//
// Env vars required (all three):
//   DIESEL_SHEETS_CLIENT_EMAIL     — service account email
//   DIESEL_SHEETS_PRIVATE_KEY      — service account private key (PEM with \n sequences)
//   DIESEL_SHEETS_SPREADSHEET_ID   — target spreadsheet ID (from its URL)
// Optional:
//   DIESEL_SHEETS_TAB_NAME         — defaults to "Fills"
//
// Tabs built by initSheetFormat():
//   1. Fills      — 32-column mirror of diesel_fills (auto-appended per submit)
//   2. Dashboard  — formula-driven overview (totals, averages, flag counts)
//
// Sync philosophy:
//   * Fire-and-forget from submit_fill — Supabase is source of truth.
//   * Backfill endpoint pulls historical rows from Supabase if Fills is empty.
//   * Sheet failures logged to diesel_audit_log (action = sheets_sync_failed).
// ============================================================

import { JWT } from 'google-auth-library';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// 32 columns — same names + order as public.diesel_fills in Supabase.
const HEADERS: readonly string[] = [
  'id',
  'truck_id',
  'driver_id',
  'odometer_km',
  'liters_filled',
  'price_per_liter_at_fill',
  'cost_aed',
  'previous_fill_id',
  'km_since_last',
  'liters_per_100km',
  'truck_rolling_avg_l100',
  'driver_rolling_avg_l100',
  'fleet_avg_l100_at_time',
  'variance_percent',
  'flagged',
  'flag_reason',
  'submitted_by_phone',
  'submitted_by_name',
  'submitted_via',
  'gemini_confidence_plate',
  'gemini_confidence_odo',
  'gemini_confidence_pump',
  'gemini_confidence_license',
  'corrected_by_human',
  'photo_plate_url',
  'photo_license_url',
  'photo_odometer_url',
  'photo_pump_url',
  'gemini_raw',
  'logged_at',
  'fill_timestamp',
  'created_at',
];

// Column-letter map (A = id, B = truck_id, ... AF = created_at)
// Useful for Dashboard formulas.
const COL = {
  id:                    'A',
  truck_id:              'B',
  driver_id:             'C',
  odometer_km:           'D',
  liters_filled:         'E',
  price_per_liter:       'F',
  cost_aed:              'G',
  previous_fill_id:      'H',
  km_since_last:         'I',
  liters_per_100km:      'J',
  truck_rolling_avg:     'K',
  driver_rolling_avg:    'L',
  fleet_avg:             'M',
  variance_percent:      'N',
  flagged:               'O',
  flag_reason:           'P',
  submitted_by_phone:    'Q',
  submitted_by_name:     'R',
  submitted_via:         'S',
  conf_plate:            'T',
  conf_odo:              'U',
  conf_pump:             'V',
  conf_license:          'W',
  corrected_by_human:    'X',
  photo_plate_url:       'Y',
  photo_license_url:     'Z',
  photo_odometer_url:    'AA',
  photo_pump_url:        'AB',
  gemini_raw:            'AC',
  logged_at:             'AD',
  fill_timestamp:        'AE',
  created_at:            'AF',
};

// SheetsFillRow = exactly a Supabase diesel_fills row (32 fields)
export type SheetsFillRow = {
  id: string;
  truck_id: string | null;
  driver_id: string | null;
  odometer_km: number | null;
  liters_filled: number | null;
  price_per_liter_at_fill: number | null;
  cost_aed: number | null;
  previous_fill_id: string | null;
  km_since_last: number | null;
  liters_per_100km: number | null;
  truck_rolling_avg_l100: number | null;
  driver_rolling_avg_l100: number | null;
  fleet_avg_l100_at_time: number | null;
  variance_percent: number | null;
  flagged: boolean;
  flag_reason: string | null;
  submitted_by_phone: string | null;
  submitted_by_name: string | null;
  submitted_via: string | null;
  gemini_confidence_plate: number | null;
  gemini_confidence_odo: number | null;
  gemini_confidence_pump: number | null;
  gemini_confidence_license: number | null;
  corrected_by_human: boolean;
  photo_plate_url: string | null;
  photo_license_url: string | null;
  photo_odometer_url: string | null;
  photo_pump_url: string | null;
  gemini_raw: unknown;              // stringified JSON for cells
  logged_at: string;
  fill_timestamp: string | null;
  created_at: string;
};

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

async function ensureTabExists(token: string, sheetId: string, tab: string): Promise<number> {
  const meta = await sheetsFetch<{
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(token, `${sheetId}?fields=sheets.properties`);
  const existing = meta.sheets?.find((s) => s.properties?.title === tab);
  if (existing?.properties?.sheetId !== undefined) return existing.properties.sheetId;

  const resp = await sheetsFetch<{
    replies?: { addSheet?: { properties?: { sheetId?: number } } }[];
  }>(token, `${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tab } } }],
    }),
  });
  const created = resp.replies?.[0]?.addSheet?.properties?.sheetId;
  if (created === undefined) throw new Error(`Could not create tab "${tab}"`);
  return created;
}

async function ensureHeaderRow(token: string, sheetId: string, tab: string) {
  await ensureTabExists(token, sheetId, tab);
  const range = `${tab}!A1:AF1`;
  const encoded = encodeURIComponent(range);
  const got = await sheetsFetch<{ values?: string[][] }>(token, `${sheetId}/values/${encoded}`);
  const firstRow = got.values?.[0] ?? [];
  // Always overwrite header row to keep it aligned with the latest schema
  if (firstRow.length !== HEADERS.length || firstRow.some((v, i) => v !== HEADERS[i])) {
    await sheetsFetch(
      token,
      `${sheetId}/values/${encoded}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ range, values: [HEADERS.slice()] }),
      }
    );
  }
}

function toRow(row: SheetsFillRow): (string | number | boolean)[] {
  const nz = (v: unknown): string | number | boolean => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v;
    return String(v);
  };
  return [
    nz(row.id),
    nz(row.truck_id),
    nz(row.driver_id),
    nz(row.odometer_km),
    nz(row.liters_filled),
    nz(row.price_per_liter_at_fill),
    nz(row.cost_aed),
    nz(row.previous_fill_id),
    nz(row.km_since_last),
    nz(row.liters_per_100km),
    nz(row.truck_rolling_avg_l100),
    nz(row.driver_rolling_avg_l100),
    nz(row.fleet_avg_l100_at_time),
    nz(row.variance_percent),
    nz(row.flagged),
    nz(row.flag_reason),
    nz(row.submitted_by_phone),
    nz(row.submitted_by_name),
    nz(row.submitted_via),
    nz(row.gemini_confidence_plate),
    nz(row.gemini_confidence_odo),
    nz(row.gemini_confidence_pump),
    nz(row.gemini_confidence_license),
    nz(row.corrected_by_human),
    nz(row.photo_plate_url),
    nz(row.photo_license_url),
    nz(row.photo_odometer_url),
    nz(row.photo_pump_url),
    row.gemini_raw == null ? '' : JSON.stringify(row.gemini_raw).slice(0, 49000),
    nz(row.logged_at),
    nz(row.fill_timestamp),
    nz(row.created_at),
  ];
}

/**
 * Append one fill row to the Sheet. No-op if unconfigured. Never throws —
 * errors get logged to diesel_audit_log instead.
 */
export async function syncFillToSheet(row: SheetsFillRow, fillId?: string): Promise<void> {
  const cfg = envConfig();
  if (!cfg) return;

  try {
    const token = await getAuthToken(cfg);
    await ensureHeaderRow(token, cfg.sheetId, cfg.tabName);
    const appendRange = encodeURIComponent(`${cfg.tabName}!A1`);
    await sheetsFetch(
      token,
      `${cfg.sheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
 * Build a SheetsFillRow directly from a diesel_fills record (no joins needed —
 * UUIDs mirror Supabase exactly). Used by submit_fill and the backfill path.
 */
export function buildSheetRow(source: Record<string, unknown>): SheetsFillRow {
  const g = (k: string): unknown => source[k];
  return {
    id:                        (g('id') as string) ?? '',
    truck_id:                  (g('truck_id') as string) ?? null,
    driver_id:                 (g('driver_id') as string) ?? null,
    odometer_km:               (g('odometer_km') as number) ?? null,
    liters_filled:             (g('liters_filled') as number) ?? null,
    price_per_liter_at_fill:   (g('price_per_liter_at_fill') as number) ?? null,
    cost_aed:                  (g('cost_aed') as number) ?? null,
    previous_fill_id:          (g('previous_fill_id') as string) ?? null,
    km_since_last:             (g('km_since_last') as number) ?? null,
    liters_per_100km:          (g('liters_per_100km') as number) ?? null,
    truck_rolling_avg_l100:    (g('truck_rolling_avg_l100') as number) ?? null,
    driver_rolling_avg_l100:   (g('driver_rolling_avg_l100') as number) ?? null,
    fleet_avg_l100_at_time:    (g('fleet_avg_l100_at_time') as number) ?? null,
    variance_percent:          (g('variance_percent') as number) ?? null,
    flagged:                   Boolean(g('flagged')),
    flag_reason:               (g('flag_reason') as string) ?? null,
    submitted_by_phone:        (g('submitted_by_phone') as string) ?? null,
    submitted_by_name:         (g('submitted_by_name') as string) ?? null,
    submitted_via:             (g('submitted_via') as string) ?? null,
    gemini_confidence_plate:   (g('gemini_confidence_plate') as number) ?? null,
    gemini_confidence_odo:     (g('gemini_confidence_odo') as number) ?? null,
    gemini_confidence_pump:    (g('gemini_confidence_pump') as number) ?? null,
    gemini_confidence_license: (g('gemini_confidence_license') as number) ?? null,
    corrected_by_human:        Boolean(g('corrected_by_human')),
    photo_plate_url:           (g('photo_plate_url') as string) ?? null,
    photo_license_url:         (g('photo_license_url') as string) ?? null,
    photo_odometer_url:        (g('photo_odometer_url') as string) ?? null,
    photo_pump_url:            (g('photo_pump_url') as string) ?? null,
    gemini_raw:                g('gemini_raw') ?? null,
    logged_at:                 (g('logged_at') as string) ?? '',
    fill_timestamp:            (g('fill_timestamp') as string) ?? null,
    created_at:                (g('created_at') as string) ?? '',
  };
}

// ============================================================
// Multi-tab dashboard: Fills (32 cols) + Dashboard (summary)
// ============================================================

const DERIVED_TABS = {
  dashboard: 'Dashboard',
} as const;

function yellow() { return { red: 0.98, green: 0.8, blue: 0.09 }; }
function lightRed() { return { red: 0.98, green: 0.88, blue: 0.88 }; }
function black() { return { red: 0, green: 0, blue: 0 }; }
function darkRed() { return { red: 0.7, green: 0.05, blue: 0.05 }; }

async function writeValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
  raw = false
) {
  const encoded = encodeURIComponent(range);
  const vio = raw ? 'RAW' : 'USER_ENTERED';
  await sheetsFetch(
    token,
    `${spreadsheetId}/values/${encoded}?valueInputOption=${vio}`,
    {
      method: 'PUT',
      body: JSON.stringify({ range, values }),
    }
  );
}

async function clearRange(token: string, spreadsheetId: string, range: string) {
  const encoded = encodeURIComponent(range);
  await sheetsFetch(token, `${spreadsheetId}/values/${encoded}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Build the Sheet: Fills tab (32 cols) + Dashboard tab (aggregates).
 * Auto-backfills Fills from Supabase if empty.
 */
export async function initSheetFormat(): Promise<{ ok: true; backfilled: number } | { ok: false; error: string }> {
  const cfg = envConfig();
  if (!cfg) return { ok: false, error: 'Sheets not configured' };
  try {
    const token = await getAuthToken(cfg);
    const fillsTab = cfg.tabName;

    // 1) Ensure both tabs exist
    const fillsTabId = await ensureTabExists(token, cfg.sheetId, fillsTab);
    const dashTabId  = await ensureTabExists(token, cfg.sheetId, DERIVED_TABS.dashboard);

    // 2) Fills tab headers (idempotent — overwrites if schema drifted)
    await ensureHeaderRow(token, cfg.sheetId, fillsTab);

    // 3) Auto-backfill Fills from Supabase if empty
    const backfilled = await backfillIfEmpty(token, cfg.sheetId, fillsTab);

    // 4) Build Dashboard tab with formulas
    await buildDashboardTab(token, cfg.sheetId, fillsTab);

    // 5) Apply formatting via batchUpdate
    const requests: unknown[] = [
      freezeFirstRow(fillsTabId),
      headerFormat(fillsTabId, HEADERS.length),
      autoResize(fillsTabId, HEADERS.length),
      flaggedConditional(fillsTabId, HEADERS.length),
      freezeRows(dashTabId, 2),
      bannerFormat(dashTabId),
      autoResize(dashTabId, 8),
    ];
    await sheetsFetch(token, `${cfg.sheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });

    return { ok: true, backfilled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------- formatting-request builders ----------
function freezeFirstRow(sheetId: number) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  };
}
function freezeRows(sheetId: number, n: number) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: n } },
      fields: 'gridProperties.frozenRowCount',
    },
  };
}
function headerFormat(sheetId: number, cols: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: {
        userEnteredFormat: {
          backgroundColor: yellow(),
          horizontalAlignment: 'CENTER',
          textFormat: { bold: true, foregroundColor: black(), fontSize: 10 },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
    },
  };
}
function bannerFormat(sheetId: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: yellow(),
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          textFormat: { bold: true, foregroundColor: black(), fontSize: 16 },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  };
}
function autoResize(sheetId: number, cols: number) {
  return {
    autoResizeDimensions: {
      dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: cols },
    },
  };
}
function flaggedConditional(sheetId: number, cols: number) {
  // Flagged is the 15th column (O). Use TRUE boolean match.
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startColumnIndex: 0, endColumnIndex: cols }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$O2=TRUE' }] },
          format: { backgroundColor: lightRed(), textFormat: { foregroundColor: darkRed() } },
        },
      },
      index: 0,
    },
  };
}

// ---------- Dashboard tab builder ----------

async function buildDashboardTab(token: string, sheetId: string, fillsTab: string) {
  await clearRange(token, sheetId, `${DERIVED_TABS.dashboard}!A1:Z200`);

  const ft = fillsTab;
  const latestQuery = `=IFERROR(QUERY(${ft}!A2:AF, "SELECT AD, B, C, E, G, J, N, O, P ORDER BY AD DESC LIMIT 10 LABEL AD 'Logged At', B 'Truck ID', C 'Driver ID', E 'Liters', G 'Cost AED', J 'L/100km', N 'Variance %', O 'Flagged', P 'Reason'"), "No fills yet.")`;

  const rows: (string | number | null)[][] = [
    ['BU FAISAL DIESEL — FLEET OVERVIEW', '', '', '', '', '', '', ''],
    [],
    ['KEY METRICS', '', '', '', '', '', '', ''],
    ['Total Fills',       `=COUNTA(${ft}!${COL.id}2:${COL.id})`, '', '', '', '', '', ''],
    ['Total Liters',      `=IFERROR(ROUND(SUM(${ft}!${COL.liters_filled}2:${COL.liters_filled}),1),0)`, 'L', '', '', '', '', ''],
    ['Total Cost',        `=IFERROR(ROUND(SUM(${ft}!${COL.cost_aed}2:${COL.cost_aed}),2),0)`, 'AED', '', '', '', '', ''],
    ['Fleet Avg L/100km', `=IFERROR(ROUND(AVERAGE(${ft}!${COL.liters_per_100km}2:${COL.liters_per_100km}),2),"—")`, '', '', '', '', '', ''],
    ['Avg Price / Liter', `=IFERROR(ROUND(AVERAGE(${ft}!${COL.price_per_liter}2:${COL.price_per_liter}),2),"—")`, 'AED', '', '', '', '', ''],
    ['Flagged Fills',     `=COUNTIF(${ft}!${COL.flagged}2:${COL.flagged}, TRUE)`, '', '', '', '', '', ''],
    ['OCR Corrections',   `=COUNTIF(${ft}!${COL.corrected_by_human}2:${COL.corrected_by_human}, TRUE)`, '', '', '', '', '', ''],
    ['Last Fill',         `=IFERROR(MAX(${ft}!${COL.logged_at}2:${COL.logged_at}),"—")`, '', '', '', '', '', ''],
    [],
    ['LATEST 10 FILLS', '', '', '', '', '', '', ''],
    [latestQuery, '', '', '', '', '', '', ''],
    [],
    ['BY TRUCK', '', '', '', '', '', '', ''],
    [
      `=IFERROR(QUERY(${ft}!A2:AF, "SELECT B, COUNT(A), SUM(E), SUM(G), AVG(J) WHERE B IS NOT NULL GROUP BY B ORDER BY AVG(J) DESC LABEL B 'Truck ID', COUNT(A) 'Fills', SUM(E) 'Liters', SUM(G) 'Cost AED', AVG(J) 'Avg L/100km'"), "")`,
      '', '', '', '', '', '', '',
    ],
    [],
    ['BY DRIVER', '', '', '', '', '', '', ''],
    [
      `=IFERROR(QUERY(${ft}!A2:AF, "SELECT C, COUNT(A), SUM(E), SUM(G), AVG(J) WHERE C IS NOT NULL GROUP BY C ORDER BY AVG(J) DESC LABEL C 'Driver ID', COUNT(A) 'Fills', SUM(E) 'Liters', SUM(G) 'Cost AED', AVG(J) 'Avg L/100km'"), "")`,
      '', '', '', '', '', '', '',
    ],
  ];
  await writeValues(token, sheetId, `${DERIVED_TABS.dashboard}!A1`, rows);
}

// ============================================================
// Backfill: pull all fills from Supabase into Fills tab if empty
// ============================================================
async function backfillIfEmpty(token: string, spreadsheetId: string, tab: string): Promise<number> {
  const range = encodeURIComponent(`${tab}!A2:A`);
  const got = await sheetsFetch<{ values?: string[][] }>(token, `${spreadsheetId}/values/${range}`);
  const existing = (got.values || []).filter((r) => r[0]);
  if (existing.length > 0) return 0;

  // Select * from diesel_fills (all 32 columns), oldest first
  const { data, error } = await supabaseAdmin
    .from('diesel_fills')
    .select('*')
    .order('logged_at', { ascending: true })
    .limit(10000);
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  const fills = (data || []) as Record<string, unknown>[];
  if (fills.length === 0) return 0;

  const sheetRows = fills.map((f) => toRow(buildSheetRow(f)));

  const appendRange = encodeURIComponent(`${tab}!A1`);
  await sheetsFetch(
    token,
    `${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: sheetRows }),
    }
  );
  return sheetRows.length;
}
