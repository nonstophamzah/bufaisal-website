// ============================================================
// /api/diesel — Single POST endpoint, action-based routing
// ============================================================
// Follows the same pattern as /api/appliances. Server-side only
// writes (service_role client). All actions rate-limited, origin-verified.
//
// Auto-create policy (added April 17 2026):
//   * Unknown plates and unknown driver names DO NOT fail the submit.
//   * We try: exact match → digits-only fuzzy (plate) / normalized-name fuzzy
//     (driver) with a configurable similarity threshold.
//   * If nothing matches, we INSERT a new row in diesel_trucks / diesel_drivers
//     with needs_review = true. Manager consolidates duplicates in dashboard.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  computeFill,
  formatConfirmation,
  normalizePlate,
  normalizeDriverName,
  similarity,
  DEFAULT_CALC_CONFIG,
  type PreviousFill,
  type CalcConfig,
} from '@/lib/diesel-calc';
import { isSheetsConfigured, buildSheetRow, syncFillToSheet, initSheetFormat, diagnoseSheets } from '@/lib/diesel-sheets';

// Resolve a window keyword to an ISO since-date (null = "all time")
function resolveWindowSince(window: string | undefined): string | null {
  switch (window) {
    case 'today':   return new Date(Date.now() - 1 * 86_400_000).toISOString();
    case 'week':    return new Date(Date.now() - 7 * 86_400_000).toISOString();
    case 'month':   return new Date(Date.now() - 30 * 86_400_000).toISOString();
    case 'quarter': return new Date(Date.now() - 90 * 86_400_000).toISOString();
    case 'all':
    default:        return null;
  }
}

// -------- types --------

type LoadedConfig = CalcConfig & {
  submitPinHash: string | null;
  managerPinHash: string | null;
  reportPhone: string | null;
  defaultPricePerLiter: number;
  driverFuzzyThreshold: number;
  plateFuzzyThreshold: number;
};

type TruckRow = {
  id: string;
  plate_number: string;
  plate_display: string;
  nickname: string | null;
  active: boolean;
  needs_review?: boolean;
};

type DriverRow = {
  id: string;
  full_name: string;
  name_normalized: string;
  license_number: string | null;
  nickname: string | null;
  active: boolean;
  needs_review?: boolean;
};

// -------- helpers --------

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function loadConfig(): Promise<LoadedConfig> {
  const { data } = await supabaseAdmin.from('diesel_config').select('*').limit(1).single();
  return {
    varianceFlagThresholdPct: data?.variance_flag_threshold_pct ?? DEFAULT_CALC_CONFIG.varianceFlagThresholdPct,
    minFillsBeforeFlagging:   data?.min_fills_before_flagging   ?? DEFAULT_CALC_CONFIG.minFillsBeforeFlagging,
    rollingWindowFills:       data?.rolling_window_fills        ?? DEFAULT_CALC_CONFIG.rollingWindowFills,
    maxKmBetweenFills:        DEFAULT_CALC_CONFIG.maxKmBetweenFills,
    maxDaysBetweenFills:      DEFAULT_CALC_CONFIG.maxDaysBetweenFills,
    maxKmPerDay:              DEFAULT_CALC_CONFIG.maxKmPerDay,
    submitPinHash:            data?.submit_pin_hash ?? null,
    managerPinHash:           data?.manager_pin_hash ?? null,
    reportPhone:              data?.report_recipient_phone ?? null,
    defaultPricePerLiter:     typeof data?.default_price_per_liter === 'number' ? data.default_price_per_liter : 4.5,
    driverFuzzyThreshold:     typeof data?.driver_fuzzy_match_threshold === 'number' ? data.driver_fuzzy_match_threshold : 0.85,
    plateFuzzyThreshold:      typeof data?.plate_fuzzy_match_threshold  === 'number' ? data.plate_fuzzy_match_threshold  : 0.85,
  };
}

async function fleetAvgL100(): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('v_diesel_fleet_avg_30d')
    .select('fleet_avg_l100')
    .limit(1)
    .single();
  return data?.fleet_avg_l100 ?? null;
}

async function writeAudit(row: {
  action: string;
  actor_phone?: string | null;
  actor_name?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}) {
  try {
    await supabaseAdmin.from('diesel_audit_log').insert(row);
  } catch {
    // never let audit failures bubble up
  }
}

// ============================================================
// Plate / driver resolvers (shared by multiple actions)
// ============================================================

type PlateResolution =
  | { status: 'matched'; truck: TruckRow; match: 'exact' | 'digits_fuzzy' | 'levenshtein' }
  | { status: 'ambiguous'; candidates: TruckRow[] }
  | { status: 'created'; truck: TruckRow }
  | { status: 'none' };

async function resolveOrCreatePlate(
  rawPlate: string | null,
  plateDisplay: string | null,
  threshold: number,
  opts: { autoCreate: boolean }
): Promise<PlateResolution> {
  if (!rawPlate) return { status: 'none' };
  const normalized = normalizePlate(rawPlate);
  if (!normalized) return { status: 'none' };

  // 1) exact match
  const exact = await supabaseAdmin
    .from('diesel_trucks')
    .select('id, plate_number, plate_display, nickname, active, needs_review')
    .eq('plate_number', normalized)
    .eq('active', true)
    .maybeSingle();
  if (exact.data) return { status: 'matched', truck: exact.data as TruckRow, match: 'exact' };

  // 2) digits-only substring (plate OCR often gets digits right, letters wrong)
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length >= 3) {
    const fuzzy = await supabaseAdmin
      .from('diesel_trucks')
      .select('id, plate_number, plate_display, nickname, active, needs_review')
      .eq('active', true)
      .ilike('plate_number', `%${digitsOnly}%`);
    const rows = (fuzzy.data || []) as TruckRow[];
    if (rows.length === 1) return { status: 'matched', truck: rows[0], match: 'digits_fuzzy' };
    if (rows.length > 1)  return { status: 'ambiguous', candidates: rows };
  }

  // 3) Levenshtein similarity across all active trucks
  const all = await supabaseAdmin
    .from('diesel_trucks')
    .select('id, plate_number, plate_display, nickname, active, needs_review')
    .eq('active', true);
  const allRows = (all.data || []) as TruckRow[];
  let best: { row: TruckRow; score: number } | null = null;
  for (const r of allRows) {
    const s = similarity(normalized, r.plate_number);
    if (!best || s > best.score) best = { row: r, score: s };
  }
  if (best && best.score >= threshold) {
    return { status: 'matched', truck: best.row, match: 'levenshtein' };
  }

  // 4) auto-create?
  if (!opts.autoCreate) return { status: 'none' };

  const display = (plateDisplay && plateDisplay.trim()) || rawPlate.trim();
  const created = await supabaseAdmin
    .from('diesel_trucks')
    .insert({
      plate_number: normalized,
      plate_display: display,
      needs_review: true,
      notes: 'Auto-created from OCR. Please verify plate_display and merge duplicates if any.',
    })
    .select('id, plate_number, plate_display, nickname, active, needs_review')
    .single();
  if (created.error || !created.data) {
    // If two concurrent submits raced and both tried to insert the same plate,
    // the unique constraint will fire. Re-fetch.
    const retry = await supabaseAdmin
      .from('diesel_trucks')
      .select('id, plate_number, plate_display, nickname, active, needs_review')
      .eq('plate_number', normalized)
      .maybeSingle();
    if (retry.data) return { status: 'matched', truck: retry.data as TruckRow, match: 'exact' };
    return { status: 'none' };
  }
  return { status: 'created', truck: created.data as TruckRow };
}

type DriverResolution =
  | { status: 'matched'; driver: DriverRow; score: number }
  | { status: 'created'; driver: DriverRow }
  | { status: 'none' };

async function resolveOrCreateDriver(
  rawName: string | null,
  licenseNumber: string | null,
  threshold: number,
  opts: { autoCreate: boolean }
): Promise<DriverResolution> {
  // 1) If license_number matches exactly, use that (strongest signal).
  if (licenseNumber && licenseNumber.trim()) {
    const byLicense = await supabaseAdmin
      .from('diesel_drivers')
      .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
      .eq('license_number', licenseNumber.trim())
      .eq('active', true)
      .maybeSingle();
    if (byLicense.data) return { status: 'matched', driver: byLicense.data as DriverRow, score: 1 };
  }

  if (!rawName) {
    if (!opts.autoCreate || !licenseNumber) return { status: 'none' };
    // License number with no readable name — create placeholder
    const placeholderName = `License ${licenseNumber.trim()}`;
    const normalized = normalizeDriverName(placeholderName);
    return await createDriverRow(placeholderName, normalized, licenseNumber.trim());
  }

  const normalized = normalizeDriverName(rawName);
  if (!normalized) return { status: 'none' };

  // 2) exact normalized match
  const exact = await supabaseAdmin
    .from('diesel_drivers')
    .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
    .eq('name_normalized', normalized)
    .eq('active', true)
    .maybeSingle();
  if (exact.data) {
    // Backfill license_number if we have a new one
    if (licenseNumber && !exact.data.license_number) {
      await supabaseAdmin
        .from('diesel_drivers')
        .update({ license_number: licenseNumber.trim(), updated_at: new Date().toISOString() })
        .eq('id', exact.data.id);
    }
    return { status: 'matched', driver: exact.data as DriverRow, score: 1 };
  }

  // 3) fuzzy across all active drivers
  const all = await supabaseAdmin
    .from('diesel_drivers')
    .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
    .eq('active', true);
  const allRows = (all.data || []) as DriverRow[];
  let best: { row: DriverRow; score: number } | null = null;
  for (const r of allRows) {
    const s = similarity(normalized, r.name_normalized);
    if (!best || s > best.score) best = { row: r, score: s };
  }
  if (best && best.score >= threshold) {
    if (licenseNumber && !best.row.license_number) {
      await supabaseAdmin
        .from('diesel_drivers')
        .update({ license_number: licenseNumber.trim(), updated_at: new Date().toISOString() })
        .eq('id', best.row.id);
    }
    return { status: 'matched', driver: best.row, score: best.score };
  }

  if (!opts.autoCreate) return { status: 'none' };
  return await createDriverRow(rawName.trim(), normalized, licenseNumber);
}

async function createDriverRow(
  fullName: string,
  normalized: string,
  licenseNumber: string | null
): Promise<DriverResolution> {
  const created = await supabaseAdmin
    .from('diesel_drivers')
    .insert({
      full_name: fullName,
      name_normalized: normalized,
      license_number: licenseNumber && licenseNumber.trim() ? licenseNumber.trim() : null,
      needs_review: true,
      notes: 'Auto-created from licence OCR. Please verify and merge duplicates if any.',
    })
    .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
    .single();
  if (created.error || !created.data) {
    // Unique collision — re-fetch
    const retry = await supabaseAdmin
      .from('diesel_drivers')
      .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
      .eq('name_normalized', normalized)
      .maybeSingle();
    if (retry.data) return { status: 'matched', driver: retry.data as DriverRow, score: 1 };
    return { status: 'none' };
  }
  return { status: 'created', driver: created.data as DriverRow };
}

// ============================================================
// POST handler
// ============================================================

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getIp(request);
  // Default rate limit: 30 req/min/IP
  const { allowed } = rateLimit(`diesel-${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const action = body.action as string | undefined;
  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    // -----------------------------------------------------------------
    // check_pin — gate the mobile web form
    // -----------------------------------------------------------------
    if (action === 'check_pin') {
      const { allowed: pinAllowed } = rateLimit(`diesel-pin-${ip}`, 5, 60_000);
      if (!pinAllowed) {
        return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
      }
      const pin = String(body.pin || '').trim();
      if (!pin) return NextResponse.json({ error: 'Missing pin' }, { status: 400 });

      const cfg = await loadConfig();
      if (!cfg.submitPinHash) {
        return NextResponse.json({ error: 'PIN not configured on server.' }, { status: 500 });
      }
      const ok = await bcrypt.compare(pin, cfg.submitPinHash);
      if (!ok) {
        await writeAudit({ action: 'pin_fail', ip_address: ip });
        return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
      }
      return NextResponse.json({ success: true });
    }

    // -----------------------------------------------------------------
    // list_trucks — for dropdown fallback if OCR fails
    // -----------------------------------------------------------------
    if (action === 'list_trucks') {
      const { data, error } = await supabaseAdmin
        .from('diesel_trucks')
        .select('id, plate_number, plate_display, nickname, needs_review')
        .eq('active', true)
        .order('plate_display', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ trucks: data || [] });
    }

    // -----------------------------------------------------------------
    // list_drivers — for dropdown fallback if license OCR fails
    // -----------------------------------------------------------------
    if (action === 'list_drivers') {
      const { data, error } = await supabaseAdmin
        .from('diesel_drivers')
        .select('id, full_name, name_normalized, license_number, nickname, needs_review')
        .eq('active', true)
        .order('full_name', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ drivers: data || [] });
    }

    // -----------------------------------------------------------------
    // resolve_plate — OCR plate -> truck lookup (no auto-create, fuzzy only)
    // -----------------------------------------------------------------
    if (action === 'resolve_plate') {
      const raw = String(body.plate || '').trim();
      if (!raw) return NextResponse.json({ error: 'Missing plate' }, { status: 400 });
      const cfg = await loadConfig();
      const res = await resolveOrCreatePlate(raw, null, cfg.plateFuzzyThreshold, { autoCreate: false });
      if (res.status === 'matched') return NextResponse.json({ truck: res.truck, match: res.match });
      if (res.status === 'ambiguous') return NextResponse.json({ truck: null, match: 'ambiguous', candidates: res.candidates });
      return NextResponse.json({ truck: null, match: 'none' });
    }

    // -----------------------------------------------------------------
    // resolve_driver — OCR name + license -> driver lookup (no auto-create, fuzzy only)
    // -----------------------------------------------------------------
    if (action === 'resolve_driver') {
      const rawName = body.name ? String(body.name) : null;
      const license = body.license_number ? String(body.license_number) : null;
      if (!rawName && !license) return NextResponse.json({ error: 'Missing name or license' }, { status: 400 });
      const cfg = await loadConfig();
      const res = await resolveOrCreateDriver(rawName, license, cfg.driverFuzzyThreshold, { autoCreate: false });
      if (res.status === 'matched') return NextResponse.json({ driver: res.driver, match: 'matched', score: res.score });
      return NextResponse.json({ driver: null, match: 'none' });
    }

    // -----------------------------------------------------------------
    // submit_fill — the core operation
    // -----------------------------------------------------------------
    if (action === 'submit_fill') {
      // Required
      const odometerKm      = Number(body.odometer_km);
      const litersFilled    = Number(body.liters_filled);
      const photoPlateUrl   = String(body.photo_plate_url || '').trim();
      const photoOdoUrl     = String(body.photo_odometer_url || '').trim();
      const photoPumpUrl    = String(body.photo_pump_url || '').trim();
      // Optional identification paths
      const truckIdFromClient = body.truck_id ? String(body.truck_id).trim() : null;
      const plateRaw          = body.plate_raw ? String(body.plate_raw).trim() : null;
      const plateDisplay      = body.plate_display ? String(body.plate_display).trim() : null;
      const driverIdFromClient= body.driver_id ? String(body.driver_id).trim() : null;
      const driverName        = body.driver_name ? String(body.driver_name).trim() : null;
      const licenseNumber     = body.driver_license_number ? String(body.driver_license_number).trim() : null;
      const photoLicenseUrl   = body.photo_license_url ? String(body.photo_license_url).trim() : null;
      // Meta
      const submittedByName = String(body.submitted_by_name || '').trim() || null;
      const submittedByPhone= String(body.submitted_by_phone || '').trim() || null;
      const correctedByHuman= Boolean(body.corrected_by_human);
      const geminiRaw       = (body.gemini_raw ?? null) as Record<string, unknown> | null;
      const confPlate       = body.gemini_confidence_plate == null ? null : Number(body.gemini_confidence_plate);
      const confOdo         = body.gemini_confidence_odo   == null ? null : Number(body.gemini_confidence_odo);
      const confPump        = body.gemini_confidence_pump  == null ? null : Number(body.gemini_confidence_pump);
      const confLicense     = body.gemini_confidence_license == null ? null : Number(body.gemini_confidence_license);
      const submittedVia    = String(body.submitted_via || 'web_form');
      const pricePerLiterOverride =
        body.price_per_liter != null && Number.isFinite(Number(body.price_per_liter))
          ? Number(body.price_per_liter)
          : null;

      // validation
      if (!Number.isFinite(odometerKm))  return NextResponse.json({ error: 'Invalid odometer_km' }, { status: 400 });
      if (odometerKm < 0)                return NextResponse.json({ error: 'Odometer must be >= 0' }, { status: 400 });
      if (!Number.isFinite(litersFilled)) return NextResponse.json({ error: 'Invalid liters_filled' }, { status: 400 });
      if (litersFilled <= 0 || litersFilled >= 2000) return NextResponse.json({ error: 'Liters out of range' }, { status: 400 });
      if (!photoPlateUrl || !photoOdoUrl || !photoPumpUrl) {
        return NextResponse.json({ error: 'Missing photos' }, { status: 400 });
      }
      if (!truckIdFromClient && !plateRaw) {
        return NextResponse.json({ error: 'Must provide truck_id or plate_raw' }, { status: 400 });
      }

      const cfg = await loadConfig();

      // -------- resolve truck --------
      let truck: TruckRow | null = null;
      let plateMatchType: string | null = null;
      if (truckIdFromClient) {
        const { data, error } = await supabaseAdmin
          .from('diesel_trucks')
          .select('id, plate_number, plate_display, nickname, active, needs_review')
          .eq('id', truckIdFromClient)
          .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data || !data.active) return NextResponse.json({ error: 'Unknown or inactive truck' }, { status: 400 });
        truck = data as TruckRow;
        plateMatchType = 'client_selected';
      } else {
        const res = await resolveOrCreatePlate(plateRaw, plateDisplay, cfg.plateFuzzyThreshold, { autoCreate: true });
        if (res.status === 'matched' || res.status === 'created') {
          truck = res.truck;
          plateMatchType = res.status === 'matched' ? res.match : 'auto_created';
        } else if (res.status === 'ambiguous') {
          return NextResponse.json({
            error: 'Multiple trucks matched the plate — please pick one',
            candidates: res.candidates,
          }, { status: 409 });
        } else {
          return NextResponse.json({ error: 'Could not resolve truck from plate' }, { status: 400 });
        }
      }

      // -------- resolve driver (optional but preferred) --------
      let driver: DriverRow | null = null;
      let driverMatchType: string | null = null;
      if (driverIdFromClient) {
        const { data, error } = await supabaseAdmin
          .from('diesel_drivers')
          .select('id, full_name, name_normalized, license_number, nickname, active, needs_review')
          .eq('id', driverIdFromClient)
          .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (data) {
          driver = data as DriverRow;
          driverMatchType = 'client_selected';
        }
      } else if (driverName || licenseNumber) {
        const res = await resolveOrCreateDriver(driverName, licenseNumber, cfg.driverFuzzyThreshold, { autoCreate: true });
        if (res.status === 'matched') { driver = res.driver; driverMatchType = `matched_${res.score.toFixed(2)}`; }
        else if (res.status === 'created') { driver = res.driver; driverMatchType = 'auto_created'; }
      }

      // -------- load history + fleet avg in parallel --------
      const [truckHistoryRes, driverHistoryRes, fleetAvg] = await Promise.all([
        supabaseAdmin
          .from('diesel_fills')
          .select('id, odometer_km, liters_per_100km, logged_at')
          .eq('truck_id', truck.id)
          .order('logged_at', { ascending: false })
          .limit(cfg.rollingWindowFills + 1),
        driver
          ? supabaseAdmin
              .from('diesel_fills')
              .select('id, odometer_km, liters_per_100km, logged_at')
              .eq('driver_id', driver.id)
              .order('logged_at', { ascending: false })
              .limit(cfg.rollingWindowFills + 1)
          : Promise.resolve({ data: [], error: null }),
        fleetAvgL100(),
      ]);
      if (truckHistoryRes.error) {
        return NextResponse.json({ error: truckHistoryRes.error.message }, { status: 500 });
      }
      const truckHistory:  PreviousFill[] = (truckHistoryRes.data  || []) as PreviousFill[];
      const driverHistory: PreviousFill[] = (driverHistoryRes.data || []) as PreviousFill[];

      // -------- price snapshot --------
      const pricePerLiter = pricePerLiterOverride ?? cfg.defaultPricePerLiter;

      // -------- calculate --------
      const result = computeFill(
        {
          truckId: truck.id,
          driverId: driver?.id ?? null,
          odometerKm,
          litersFilled,
          pricePerLiter,
        },
        truckHistory,
        driverHistory,
        fleetAvg,
        cfg
      );

      // -------- HARD REJECT path (e.g. odometer regression) --------
      if (result.hardReject) {
        await writeAudit({
          action: 'submit_fill_rejected',
          actor_phone: submittedByPhone,
          actor_name: submittedByName,
          target_id: truck.id,
          ip_address: ip,
          user_agent: request.headers.get('user-agent') || null,
          details: {
            reason: result.hardRejectReason,
            plate: truck.plate_display,
            odometer_km: odometerKm,
            liters_filled: litersFilled,
          },
        });
        return NextResponse.json(
          { error: result.hardRejectReason || 'Submission rejected', reason_code: result.anomalies[0] || 'rejected' },
          { status: 400 }
        );
      }

      // -------- insert --------
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('diesel_fills')
        .insert({
          truck_id: truck.id,
          driver_id: driver?.id ?? null,
          odometer_km: odometerKm,
          liters_filled: litersFilled,
          price_per_liter_at_fill: pricePerLiter,
          cost_aed: result.costAed,
          previous_fill_id: result.previousFillId,
          km_since_last: result.kmSinceLast,
          liters_per_100km: result.litersPer100km,
          truck_rolling_avg_l100: result.truckRollingAvg,
          driver_rolling_avg_l100: result.driverRollingAvg,
          fleet_avg_l100_at_time: result.fleetAvg,
          variance_percent: result.variancePercent,
          flagged: result.flagged,
          flag_reason: result.flagReason,
          submitted_by_phone: submittedByPhone,
          submitted_by_name: submittedByName,
          submitted_via: submittedVia,
          gemini_confidence_plate: confPlate,
          gemini_confidence_odo: confOdo,
          gemini_confidence_pump: confPump,
          gemini_confidence_license: confLicense,
          corrected_by_human: correctedByHuman,
          photo_plate_url: photoPlateUrl,
          photo_license_url: photoLicenseUrl,
          photo_odometer_url: photoOdoUrl,
          photo_pump_url: photoPumpUrl,
          gemini_raw: geminiRaw,
        })
        .select('*')
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      await writeAudit({
        action: 'submit_fill',
        actor_phone: submittedByPhone,
        actor_name: submittedByName,
        target_id: inserted.id,
        ip_address: ip,
        user_agent: request.headers.get('user-agent') || null,
        details: {
          truck_id: truck.id,
          plate: truck.plate_display,
          driver_id: driver?.id ?? null,
          driver_name: driver?.full_name ?? null,
          plate_match: plateMatchType,
          driver_match: driverMatchType,
          odometer_km: odometerKm,
          liters_filled: litersFilled,
          price_per_liter: pricePerLiter,
          cost_aed: result.costAed,
          computed: result,
          corrected_by_human: correctedByHuman,
        },
      });

      // ---- fire-and-forget Google Sheets sync (feature-flagged by env) ----
      // We pass the full inserted row — buildSheetRow mirrors all 32 columns.
      if (isSheetsConfigured()) {
        const sheetRow = buildSheetRow(inserted as unknown as Record<string, unknown>);
        // Intentionally not awaited — syncFillToSheet swallows + logs errors.
        void syncFillToSheet(sheetRow, inserted.id);
      }

      const confirmation = formatConfirmation(
        truck.plate_display,
        driver?.full_name ?? null,
        litersFilled,
        result.kmSinceLast,
        result.litersPer100km,
        result.flagged,
        result.variancePercent
      );

      return NextResponse.json({
        success: true,
        fill_id: inserted.id,
        confirmation,
        truck: { id: truck.id, plate_display: truck.plate_display, needs_review: !!truck.needs_review },
        driver: driver
          ? { id: driver.id, full_name: driver.full_name, needs_review: !!driver.needs_review }
          : null,
        match_info: { plate_match: plateMatchType, driver_match: driverMatchType },
        computed: {
          km_since_last: result.kmSinceLast,
          liters_per_100km: result.litersPer100km,
          truck_rolling_avg_l100: result.truckRollingAvg,
          driver_rolling_avg_l100: result.driverRollingAvg,
          fleet_avg_l100: result.fleetAvg,
          variance_percent: result.variancePercent,
          baseline_used: result.baselineUsed,
          flagged: result.flagged,
          flag_reason: result.flagReason,
          anomalies: result.anomalies,
          cost_aed: result.costAed,
          price_per_liter: pricePerLiter,
        },
      });
    }

    // -----------------------------------------------------------------
    // recent_fills — for the manager dashboard (gated later)
    // -----------------------------------------------------------------
    if (action === 'recent_fills') {
      const limit = Math.min(Number(body.limit) || 50, 500);
      const { data, error } = await supabaseAdmin
        .from('diesel_fills')
        .select(`
          id, logged_at, odometer_km, liters_filled, km_since_last, liters_per_100km,
          price_per_liter_at_fill, cost_aed,
          truck_rolling_avg_l100, driver_rolling_avg_l100, fleet_avg_l100_at_time,
          variance_percent, flagged, flag_reason,
          photo_plate_url, photo_license_url, photo_odometer_url, photo_pump_url,
          corrected_by_human, submitted_by_name,
          truck:diesel_trucks(id, plate_display, nickname, needs_review),
          driver:diesel_drivers(id, full_name, nickname, needs_review)
        `)
        .order('logged_at', { ascending: false })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ fills: data || [] });
    }

    // -----------------------------------------------------------------
    // check_manager_pin — gate the /diesel/dashboard UI
    // Falls back to submit_pin_hash if manager_pin_hash is not set, so
    // Hamzah can get in on day one without extra setup.
    // -----------------------------------------------------------------
    if (action === 'check_manager_pin') {
      const { allowed: pinAllowed } = rateLimit(`diesel-mgr-pin-${ip}`, 5, 60_000);
      if (!pinAllowed) {
        return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
      }
      const pin = String(body.pin || '').trim();
      if (!pin) return NextResponse.json({ error: 'Missing pin' }, { status: 400 });

      const cfg = await loadConfig();
      const hash = cfg.managerPinHash || cfg.submitPinHash;
      if (!hash) {
        return NextResponse.json({ error: 'PIN not configured on server.' }, { status: 500 });
      }
      const ok = await bcrypt.compare(pin, hash);
      if (!ok) {
        await writeAudit({ action: 'manager_pin_fail', ip_address: ip });
        return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
      }
      return NextResponse.json({
        success: true,
        using_fallback_pin: !cfg.managerPinHash,
        sheets_configured: isSheetsConfigured(),
      });
    }

    // -----------------------------------------------------------------
    // dashboard_snapshot — returns everything the dashboard needs.
    // Accepts optional window: today | week | month | quarter | all (default).
    // The window affects Trucks / Drivers / Flagged aggregates and the fleet
    // avg shown on the Today card. Today list is always last-24h.
    // -----------------------------------------------------------------
    if (action === 'dashboard_snapshot') {
      const win = String(body.window || 'all');
      const since = resolveWindowSince(win);

      // Build common fills query — used for both "recent/today" and window aggregates
      let windowFillsQ = supabaseAdmin
        .from('diesel_fills')
        .select(`
          id, truck_id, driver_id, logged_at, odometer_km, liters_filled,
          km_since_last, liters_per_100km, cost_aed, variance_percent,
          flagged, flag_reason,
          photo_plate_url, photo_license_url, photo_odometer_url, photo_pump_url,
          truck:diesel_trucks(id, plate_display, nickname),
          driver:diesel_drivers(id, full_name, nickname)
        `)
        .order('logged_at', { ascending: false })
        .limit(2000);
      if (since) windowFillsQ = windowFillsQ.gte('logged_at', since);

      const [recentRes, windowFillsRes, allTrucksRes, allDriversRes, needsTrucksRes, needsDriversRes] =
        await Promise.all([
          supabaseAdmin
            .from('diesel_fills')
            .select(`
              id, logged_at, odometer_km, liters_filled, km_since_last, liters_per_100km,
              cost_aed, variance_percent, flagged, flag_reason,
              truck:diesel_trucks(id, plate_display, nickname),
              driver:diesel_drivers(id, full_name, nickname)
            `)
            .gte('logged_at', new Date(Date.now() - 24 * 3600_000).toISOString())
            .order('logged_at', { ascending: false })
            .limit(200),
          windowFillsQ,
          supabaseAdmin
            .from('diesel_trucks')
            .select('id, plate_number, plate_display, nickname, active, needs_review')
            .eq('active', true),
          supabaseAdmin
            .from('diesel_drivers')
            .select('id, full_name, name_normalized, nickname, active, needs_review')
            .eq('active', true),
          supabaseAdmin
            .from('diesel_trucks')
            .select('id, plate_number, plate_display, nickname, created_at')
            .eq('needs_review', true)
            .eq('active', true)
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('diesel_drivers')
            .select('id, full_name, name_normalized, license_number, nickname, created_at')
            .eq('needs_review', true)
            .eq('active', true)
            .order('created_at', { ascending: false }),
        ]);

      type WFill = {
        id: string; truck_id: string | null; driver_id: string | null;
        logged_at: string; liters_filled: number | null;
        liters_per_100km: number | null; cost_aed: number | null;
        variance_percent: number | null; flagged: boolean | null;
        flag_reason: string | null;
        photo_plate_url: string | null; photo_license_url: string | null;
        photo_odometer_url: string | null; photo_pump_url: string | null;
        odometer_km: number | null; km_since_last: number | null;
        truck: { id: string; plate_display: string; nickname: string | null } | null;
        driver: { id: string; full_name: string; nickname: string | null } | null;
      };
      const windowFills = ((windowFillsRes.data || []) as unknown as WFill[]);

      // Fleet avg L/100km in window
      const l100InWindow = windowFills.map((f) => f.liters_per_100km).filter((x): x is number => typeof x === 'number' && x > 0);
      const fleetAvg = l100InWindow.length ? Math.round((l100InWindow.reduce((a, b) => a + b, 0) / l100InWindow.length) * 100) / 100 : null;

      // Aggregate by truck
      type Agg = { fills: number; liters: number; cost: number; l100_sum: number; l100_count: number; flagged: number; last_at: string | null };
      const truckAgg = new Map<string, Agg>();
      for (const f of windowFills) {
        if (!f.truck_id) continue;
        let a = truckAgg.get(f.truck_id);
        if (!a) { a = { fills: 0, liters: 0, cost: 0, l100_sum: 0, l100_count: 0, flagged: 0, last_at: null }; truckAgg.set(f.truck_id, a); }
        a.fills += 1;
        if (typeof f.liters_filled === 'number') a.liters += f.liters_filled;
        if (typeof f.cost_aed === 'number') a.cost += f.cost_aed;
        if (typeof f.liters_per_100km === 'number') { a.l100_sum += f.liters_per_100km; a.l100_count += 1; }
        if (f.flagged) a.flagged += 1;
        if (!a.last_at || f.logged_at > a.last_at) a.last_at = f.logged_at;
      }
      const trucks = (allTrucksRes.data || []).map((t) => {
        const a = truckAgg.get(t.id);
        const avg = a && a.l100_count ? Math.round((a.l100_sum / a.l100_count) * 100) / 100 : null;
        return {
          truck_id: t.id,
          plate_number: t.plate_number,
          plate_display: t.plate_display,
          nickname: t.nickname,
          active: t.active,
          needs_review: !!t.needs_review,
          total_fills: a?.fills ?? 0,
          total_liters: a ? Math.round(a.liters * 100) / 100 : 0,
          total_cost_aed: a ? Math.round(a.cost * 100) / 100 : 0,
          avg_l100_last10: avg,
          avg_l100_alltime: avg,
          flag_count: a?.flagged ?? 0,
          last_fill_at: a?.last_at ?? null,
        };
      }).sort((a, b) => (b.avg_l100_last10 ?? -1) - (a.avg_l100_last10 ?? -1));

      // Aggregate by driver
      const driverAgg = new Map<string, Agg>();
      for (const f of windowFills) {
        if (!f.driver_id) continue;
        let a = driverAgg.get(f.driver_id);
        if (!a) { a = { fills: 0, liters: 0, cost: 0, l100_sum: 0, l100_count: 0, flagged: 0, last_at: null }; driverAgg.set(f.driver_id, a); }
        a.fills += 1;
        if (typeof f.liters_filled === 'number') a.liters += f.liters_filled;
        if (typeof f.cost_aed === 'number') a.cost += f.cost_aed;
        if (typeof f.liters_per_100km === 'number') { a.l100_sum += f.liters_per_100km; a.l100_count += 1; }
        if (f.flagged) a.flagged += 1;
        if (!a.last_at || f.logged_at > a.last_at) a.last_at = f.logged_at;
      }
      const drivers = (allDriversRes.data || []).map((d) => {
        const a = driverAgg.get(d.id);
        const avg = a && a.l100_count ? Math.round((a.l100_sum / a.l100_count) * 100) / 100 : null;
        return {
          driver_id: d.id,
          full_name: d.full_name,
          name_normalized: d.name_normalized,
          nickname: d.nickname,
          active: d.active,
          needs_review: !!d.needs_review,
          total_fills: a?.fills ?? 0,
          total_liters: a ? Math.round(a.liters * 100) / 100 : 0,
          total_cost_aed: a ? Math.round(a.cost * 100) / 100 : 0,
          avg_l100_last10: avg,
          avg_l100_alltime: avg,
          flag_count: a?.flagged ?? 0,
          last_fill_at: a?.last_at ?? null,
        };
      }).sort((a, b) => (b.avg_l100_last10 ?? -1) - (a.avg_l100_last10 ?? -1));

      const flagged = windowFills.filter((f) => f.flagged);

      return NextResponse.json({
        window: win,
        since,
        today: recentRes.data || [],
        trucks,
        drivers,
        flagged,
        needs_review: {
          trucks: needsTrucksRes.data || [],
          drivers: needsDriversRes.data || [],
        },
        fleet_avg_l100: fleetAvg,
        totals: {
          fills: windowFills.length,
          liters: Math.round(windowFills.reduce((a, f) => a + (f.liters_filled || 0), 0) * 100) / 100,
          cost_aed: Math.round(windowFills.reduce((a, f) => a + (f.cost_aed || 0), 0) * 100) / 100,
          flagged: flagged.length,
        },
        sheets_configured: isSheetsConfigured(),
      });
    }

    // -----------------------------------------------------------------
    // truck_detail — per-truck drill-down. Returns truck metadata,
    // aggregated stats in requested window, and full fill history.
    // -----------------------------------------------------------------
    if (action === 'truck_detail') {
      const id = String(body.id || '').trim();
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const win = String(body.window || 'all');
      const since = resolveWindowSince(win);

      const [truckRes, fillsRes] = await Promise.all([
        supabaseAdmin
          .from('diesel_trucks')
          .select('id, plate_number, plate_display, nickname, active, needs_review, notes, created_at')
          .eq('id', id)
          .maybeSingle(),
        (async () => {
          let q = supabaseAdmin
            .from('diesel_fills')
            .select(`
              id, logged_at, odometer_km, liters_filled, km_since_last, liters_per_100km,
              cost_aed, price_per_liter_at_fill, variance_percent, flagged, flag_reason,
              photo_plate_url, photo_license_url, photo_odometer_url, photo_pump_url,
              driver:diesel_drivers(id, full_name, nickname)
            `)
            .eq('truck_id', id)
            .order('logged_at', { ascending: false })
            .limit(1000);
          if (since) q = q.gte('logged_at', since);
          return q;
        })(),
      ]);

      if (truckRes.error) return NextResponse.json({ error: truckRes.error.message }, { status: 500 });
      if (!truckRes.data) return NextResponse.json({ error: 'Truck not found' }, { status: 404 });

      type F = { id: string; logged_at: string; liters_filled: number | null; cost_aed: number | null; liters_per_100km: number | null; flagged: boolean | null; driver: { id: string; full_name: string } | { id: string; full_name: string }[] | null };
      const fills = ((fillsRes.data || []) as unknown as F[]);
      const l100 = fills.map((f) => f.liters_per_100km).filter((x): x is number => typeof x === 'number');
      const totalLiters = fills.reduce((a, f) => a + (f.liters_filled || 0), 0);
      const totalCost = fills.reduce((a, f) => a + (f.cost_aed || 0), 0);
      const avgL100 = l100.length ? Math.round((l100.reduce((a, b) => a + b, 0) / l100.length) * 100) / 100 : null;

      // Per-driver split inside window
      const byDriver = new Map<string, { name: string; fills: number; liters: number; l100_sum: number; l100_count: number }>();
      for (const f of fills) {
        const dr = Array.isArray(f.driver) ? f.driver[0] : f.driver;
        if (!dr?.id) continue;
        let a = byDriver.get(dr.id);
        if (!a) { a = { name: dr.full_name, fills: 0, liters: 0, l100_sum: 0, l100_count: 0 }; byDriver.set(dr.id, a); }
        a.fills += 1;
        if (typeof f.liters_filled === 'number') a.liters += f.liters_filled;
        if (typeof f.liters_per_100km === 'number') { a.l100_sum += f.liters_per_100km; a.l100_count += 1; }
      }
      const driverMix = Array.from(byDriver.entries()).map(([id, a]) => ({
        driver_id: id,
        name: a.name,
        fills: a.fills,
        liters: Math.round(a.liters * 100) / 100,
        avg_l100: a.l100_count ? Math.round((a.l100_sum / a.l100_count) * 100) / 100 : null,
      })).sort((a, b) => b.fills - a.fills);

      return NextResponse.json({
        window: win,
        since,
        truck: truckRes.data,
        stats: {
          total_fills: fills.length,
          total_liters: Math.round(totalLiters * 100) / 100,
          total_cost_aed: Math.round(totalCost * 100) / 100,
          avg_l100: avgL100,
          flag_count: fills.filter((f) => f.flagged).length,
        },
        driver_mix: driverMix,
        fills,
      });
    }

    // -----------------------------------------------------------------
    // driver_detail — per-driver drill-down.
    // -----------------------------------------------------------------
    if (action === 'driver_detail') {
      const id = String(body.id || '').trim();
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const win = String(body.window || 'all');
      const since = resolveWindowSince(win);

      const [driverRes, fillsRes] = await Promise.all([
        supabaseAdmin
          .from('diesel_drivers')
          .select('id, full_name, name_normalized, nickname, license_number, active, needs_review, notes, created_at')
          .eq('id', id)
          .maybeSingle(),
        (async () => {
          let q = supabaseAdmin
            .from('diesel_fills')
            .select(`
              id, logged_at, odometer_km, liters_filled, km_since_last, liters_per_100km,
              cost_aed, price_per_liter_at_fill, variance_percent, flagged, flag_reason,
              photo_plate_url, photo_license_url, photo_odometer_url, photo_pump_url,
              truck:diesel_trucks(id, plate_display, nickname)
            `)
            .eq('driver_id', id)
            .order('logged_at', { ascending: false })
            .limit(1000);
          if (since) q = q.gte('logged_at', since);
          return q;
        })(),
      ]);

      if (driverRes.error) return NextResponse.json({ error: driverRes.error.message }, { status: 500 });
      if (!driverRes.data) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

      type F = { id: string; logged_at: string; liters_filled: number | null; cost_aed: number | null; liters_per_100km: number | null; flagged: boolean | null; truck: { id: string; plate_display: string } | { id: string; plate_display: string }[] | null };
      const fills = ((fillsRes.data || []) as unknown as F[]);
      const l100 = fills.map((f) => f.liters_per_100km).filter((x): x is number => typeof x === 'number');
      const totalLiters = fills.reduce((a, f) => a + (f.liters_filled || 0), 0);
      const totalCost = fills.reduce((a, f) => a + (f.cost_aed || 0), 0);
      const avgL100 = l100.length ? Math.round((l100.reduce((a, b) => a + b, 0) / l100.length) * 100) / 100 : null;

      // Per-truck split
      const byTruck = new Map<string, { plate: string; fills: number; liters: number; l100_sum: number; l100_count: number }>();
      for (const f of fills) {
        const tr = Array.isArray(f.truck) ? f.truck[0] : f.truck;
        if (!tr?.id) continue;
        let a = byTruck.get(tr.id);
        if (!a) { a = { plate: tr.plate_display, fills: 0, liters: 0, l100_sum: 0, l100_count: 0 }; byTruck.set(tr.id, a); }
        a.fills += 1;
        if (typeof f.liters_filled === 'number') a.liters += f.liters_filled;
        if (typeof f.liters_per_100km === 'number') { a.l100_sum += f.liters_per_100km; a.l100_count += 1; }
      }
      const truckMix = Array.from(byTruck.entries()).map(([id, a]) => ({
        truck_id: id,
        plate: a.plate,
        fills: a.fills,
        liters: Math.round(a.liters * 100) / 100,
        avg_l100: a.l100_count ? Math.round((a.l100_sum / a.l100_count) * 100) / 100 : null,
      })).sort((a, b) => b.fills - a.fills);

      return NextResponse.json({
        window: win,
        since,
        driver: driverRes.data,
        stats: {
          total_fills: fills.length,
          total_liters: Math.round(totalLiters * 100) / 100,
          total_cost_aed: Math.round(totalCost * 100) / 100,
          avg_l100: avgL100,
          flag_count: fills.filter((f) => f.flagged).length,
        },
        truck_mix: truckMix,
        fills,
      });
    }

    // -----------------------------------------------------------------
    // init_sheets_format — builds the full 5-tab Sheets dashboard,
    // auto-backfills Fills from Supabase if empty, applies all formatting.
    // -----------------------------------------------------------------
    if (action === 'init_sheets_format') {
      if (!isSheetsConfigured()) {
        await writeAudit({
          action: 'init_sheets_format_failed',
          ip_address: ip,
          details: {
            error: 'Google Sheets not configured (env vars missing)',
            seen_env: {
              DIESEL_SHEETS_CLIENT_EMAIL:   !!process.env.DIESEL_SHEETS_CLIENT_EMAIL,
              GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
              DIESEL_SHEETS_PRIVATE_KEY:    !!process.env.DIESEL_SHEETS_PRIVATE_KEY,
              GOOGLE_PRIVATE_KEY:           !!process.env.GOOGLE_PRIVATE_KEY,
              DIESEL_SHEETS_SPREADSHEET_ID: !!process.env.DIESEL_SHEETS_SPREADSHEET_ID,
              DIESEL_GOOGLE_SHEET_ID:       !!process.env.DIESEL_GOOGLE_SHEET_ID,
            },
          },
        });
        return NextResponse.json({ error: 'Google Sheets not configured' }, { status: 400 });
      }
      const r = await initSheetFormat();
      if (!r.ok) {
        // Previously we only logged success — now log failures too so we can
        // diagnose without needing the user to screenshot a 3-second toast.
        await writeAudit({
          action: 'init_sheets_format_failed',
          ip_address: ip,
          details: { error: r.error },
        });
        return NextResponse.json({ error: r.error }, { status: 500 });
      }
      await writeAudit({
        action: 'init_sheets_format',
        ip_address: ip,
        details: { backfilled: r.backfilled },
      });
      return NextResponse.json({ success: true, backfilled: r.backfilled });
    }

    // -----------------------------------------------------------------
    // audit_errors — surface recent sheets/audit failures so the dashboard
    // (or a curl) can diagnose a broken sync without opening Supabase Studio.
    // -----------------------------------------------------------------
    if (action === 'audit_errors') {
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 500);
      const actions = [
        'sheets_sync_failed',
        'init_sheets_format_failed',
        'submit_fill_rejected',
        'pin_fail',
        'manager_pin_fail',
      ];
      const { data, error } = await supabaseAdmin
        .from('diesel_audit_log')
        .select('id, action, created_at, target_id, details, ip_address')
        .in('action', actions)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        entries: data || [],
        sheets_configured: isSheetsConfigured(),
        // Non-secret presence booleans so we can confirm which env var names are live.
        env_present: {
          DIESEL_SHEETS_CLIENT_EMAIL:   !!process.env.DIESEL_SHEETS_CLIENT_EMAIL,
          GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          DIESEL_SHEETS_PRIVATE_KEY:    !!process.env.DIESEL_SHEETS_PRIVATE_KEY,
          GOOGLE_PRIVATE_KEY:           !!process.env.GOOGLE_PRIVATE_KEY,
          DIESEL_SHEETS_SPREADSHEET_ID: !!process.env.DIESEL_SHEETS_SPREADSHEET_ID,
          DIESEL_GOOGLE_SHEET_ID:       !!process.env.DIESEL_GOOGLE_SHEET_ID,
        },
      });
    }

    // -----------------------------------------------------------------
    // sheets_diagnostic — step-by-step smoke test of the Sheets path so
    // we can pinpoint exactly where auth / API-enablement / permission fails.
    // -----------------------------------------------------------------
    if (action === 'sheets_diagnostic') {
      const result = await diagnoseSheets();
      await writeAudit({
        action: result.ok ? 'sheets_diagnostic_ok' : 'sheets_diagnostic_failed',
        ip_address: ip,
        details: result,
      });
      return NextResponse.json(result);
    }

    // -----------------------------------------------------------------
    // full_log — paginated + filterable log for the Log tab
    // -----------------------------------------------------------------
    if (action === 'full_log') {
      const limit  = Math.min(Number(body.limit)  || 100, 500);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const truckId  = body.truck_id  ? String(body.truck_id)  : null;
      const driverId = body.driver_id ? String(body.driver_id) : null;
      const flaggedOnly = Boolean(body.flagged_only);
      const sinceIso = body.since ? String(body.since) : null;

      let q = supabaseAdmin
        .from('diesel_fills')
        .select(`
          id, logged_at, odometer_km, liters_filled, km_since_last, liters_per_100km,
          price_per_liter_at_fill, cost_aed,
          truck_rolling_avg_l100, driver_rolling_avg_l100, fleet_avg_l100_at_time,
          variance_percent, flagged, flag_reason,
          photo_plate_url, photo_license_url, photo_odometer_url, photo_pump_url,
          corrected_by_human, submitted_by_name,
          truck:diesel_trucks(id, plate_display, nickname, needs_review),
          driver:diesel_drivers(id, full_name, nickname, needs_review)
        `, { count: 'exact' })
        .order('logged_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (truckId)  q = q.eq('truck_id', truckId);
      if (driverId) q = q.eq('driver_id', driverId);
      if (flaggedOnly) q = q.eq('flagged', true);
      if (sinceIso) q = q.gte('logged_at', sinceIso);

      const { data, count, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ fills: data || [], total: count ?? 0 });
    }

    // -----------------------------------------------------------------
    // trends_data — per-day liters/cost aggregates (for charts)
    // -----------------------------------------------------------------
    if (action === 'trends_data') {
      const days = Math.min(Math.max(Number(body.days) || 30, 7), 365);
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('diesel_fills')
        .select('logged_at, liters_filled, cost_aed, liters_per_100km, flagged')
        .gte('logged_at', since)
        .order('logged_at', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Bucket into days (Dubai timezone)
      const buckets = new Map<string, {
        date: string;
        liters: number;
        cost: number;
        l100_sum: number;
        l100_count: number;
        fills: number;
        flagged: number;
      }>();
      for (const row of data || []) {
        const dt = new Date(row.logged_at);
        const dateKey = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
        let b = buckets.get(dateKey);
        if (!b) {
          b = { date: dateKey, liters: 0, cost: 0, l100_sum: 0, l100_count: 0, fills: 0, flagged: 0 };
          buckets.set(dateKey, b);
        }
        b.fills += 1;
        if (typeof row.liters_filled === 'number') b.liters += row.liters_filled;
        if (typeof row.cost_aed === 'number') b.cost += row.cost_aed;
        if (typeof row.liters_per_100km === 'number') { b.l100_sum += row.liters_per_100km; b.l100_count += 1; }
        if (row.flagged) b.flagged += 1;
      }
      const series = Array.from(buckets.values()).map((b) => ({
        date: b.date,
        fills: b.fills,
        liters: Math.round(b.liters * 100) / 100,
        cost_aed: Math.round(b.cost * 100) / 100,
        avg_l100: b.l100_count ? Math.round((b.l100_sum / b.l100_count) * 100) / 100 : null,
        flagged: b.flagged,
      }));
      return NextResponse.json({ days, series });
    }

    // -----------------------------------------------------------------
    // report_{daily,weekly,monthly} — aggregates for scheduled reports
    // -----------------------------------------------------------------
    if (action === 'report_daily' || action === 'report_weekly' || action === 'report_monthly') {
      const windowDays = action === 'report_daily' ? 1 : action === 'report_weekly' ? 7 : 30;
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
      const fillsRes = await supabaseAdmin
        .from('diesel_fills')
        .select(`
          id, logged_at, truck_id, driver_id, liters_filled, cost_aed, liters_per_100km,
          variance_percent, flagged, flag_reason,
          truck:diesel_trucks(plate_display),
          driver:diesel_drivers(full_name)
        `)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false });
      if (fillsRes.error) return NextResponse.json({ error: fillsRes.error.message }, { status: 500 });
      const rows = fillsRes.data || [];

      const totalLiters = rows.reduce((a, r) => a + (typeof r.liters_filled === 'number' ? r.liters_filled : 0), 0);
      const totalCost   = rows.reduce((a, r) => a + (typeof r.cost_aed === 'number'     ? r.cost_aed     : 0), 0);
      const l100Vals    = rows.map((r) => r.liters_per_100km).filter((x): x is number => typeof x === 'number');
      const fleetAvg    = l100Vals.length ? l100Vals.reduce((a, b) => a + b, 0) / l100Vals.length : null;
      const flags       = rows.filter((r) => r.flagged);

      // Worst trucks by avg L/100km in window
      const byTruck = new Map<string, { plate: string; fills: number; liters: number; l100_sum: number; l100_count: number; flagged: number }>();
      for (const r of rows) {
        if (!r.truck_id) continue;
        const key = r.truck_id;
        const truckRel = Array.isArray(r.truck) ? r.truck[0] : r.truck;
        const plate = truckRel?.plate_display || 'unknown';
        let b = byTruck.get(key);
        if (!b) { b = { plate, fills: 0, liters: 0, l100_sum: 0, l100_count: 0, flagged: 0 }; byTruck.set(key, b); }
        b.fills += 1;
        if (typeof r.liters_filled === 'number') b.liters += r.liters_filled;
        if (typeof r.liters_per_100km === 'number') { b.l100_sum += r.liters_per_100km; b.l100_count += 1; }
        if (r.flagged) b.flagged += 1;
      }
      const worstTrucks = Array.from(byTruck.entries())
        .map(([id, b]) => ({ truck_id: id, plate: b.plate, fills: b.fills, liters: Math.round(b.liters * 100) / 100, avg_l100: b.l100_count ? Math.round((b.l100_sum / b.l100_count) * 100) / 100 : null, flagged: b.flagged }))
        .filter((t) => t.avg_l100 !== null)
        .sort((a, b) => (b.avg_l100 ?? 0) - (a.avg_l100 ?? 0))
        .slice(0, 10);

      // Worst drivers same shape
      const byDriver = new Map<string, { name: string; fills: number; liters: number; l100_sum: number; l100_count: number; flagged: number }>();
      for (const r of rows) {
        if (!r.driver_id) continue;
        const key = r.driver_id;
        const driverRel = Array.isArray(r.driver) ? r.driver[0] : r.driver;
        const name = driverRel?.full_name || 'unknown';
        let b = byDriver.get(key);
        if (!b) { b = { name, fills: 0, liters: 0, l100_sum: 0, l100_count: 0, flagged: 0 }; byDriver.set(key, b); }
        b.fills += 1;
        if (typeof r.liters_filled === 'number') b.liters += r.liters_filled;
        if (typeof r.liters_per_100km === 'number') { b.l100_sum += r.liters_per_100km; b.l100_count += 1; }
        if (r.flagged) b.flagged += 1;
      }
      const worstDrivers = Array.from(byDriver.entries())
        .map(([id, b]) => ({ driver_id: id, name: b.name, fills: b.fills, liters: Math.round(b.liters * 100) / 100, avg_l100: b.l100_count ? Math.round((b.l100_sum / b.l100_count) * 100) / 100 : null, flagged: b.flagged }))
        .filter((d) => d.avg_l100 !== null)
        .sort((a, b) => (b.avg_l100 ?? 0) - (a.avg_l100 ?? 0))
        .slice(0, 10);

      return NextResponse.json({
        window: action,
        window_days: windowDays,
        since,
        total_fills: rows.length,
        total_liters: Math.round(totalLiters * 100) / 100,
        total_cost_aed: Math.round(totalCost * 100) / 100,
        fleet_avg_l100: fleetAvg !== null ? Math.round(fleetAvg * 100) / 100 : null,
        flag_count: flags.length,
        worst_trucks: worstTrucks,
        worst_drivers: worstDrivers,
        anomalies: flags.map((r) => {
          const tr = Array.isArray(r.truck) ? r.truck[0] : r.truck;
          const dr = Array.isArray(r.driver) ? r.driver[0] : r.driver;
          return { id: r.id, logged_at: r.logged_at, plate: tr?.plate_display || null, driver: dr?.full_name || null, l100: r.liters_per_100km, variance_pct: r.variance_percent, reason: r.flag_reason };
        }),
      });
    }

    // -----------------------------------------------------------------
    // edit_truck / edit_driver — dashboard cleanup tools
    // -----------------------------------------------------------------
    if (action === 'edit_truck') {
      const id = String(body.id || '').trim();
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (typeof body.plate_display === 'string') patch.plate_display = body.plate_display.trim();
      if (typeof body.nickname === 'string' || body.nickname === null) patch.nickname = body.nickname;
      if (typeof body.active === 'boolean') patch.active = body.active;
      if (typeof body.needs_review === 'boolean') patch.needs_review = body.needs_review;
      if (typeof body.notes === 'string' || body.notes === null) patch.notes = body.notes;
      if (typeof body.plate_number === 'string') patch.plate_number = normalizePlate(body.plate_number);
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      patch.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('diesel_trucks')
        .update(patch)
        .eq('id', id)
        .select('id, plate_number, plate_display, nickname, active, needs_review, notes')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await writeAudit({ action: 'edit_truck', target_id: id, ip_address: ip, details: { patch } });
      return NextResponse.json({ success: true, truck: data });
    }

    if (action === 'edit_driver') {
      const id = String(body.id || '').trim();
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (typeof body.full_name === 'string') {
        patch.full_name = body.full_name.trim();
        patch.name_normalized = normalizeDriverName(body.full_name);
      }
      if (typeof body.nickname === 'string' || body.nickname === null) patch.nickname = body.nickname;
      if (typeof body.license_number === 'string' || body.license_number === null) patch.license_number = body.license_number;
      if (typeof body.active === 'boolean') patch.active = body.active;
      if (typeof body.needs_review === 'boolean') patch.needs_review = body.needs_review;
      if (typeof body.notes === 'string' || body.notes === null) patch.notes = body.notes;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      patch.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('diesel_drivers')
        .update(patch)
        .eq('id', id)
        .select('id, full_name, name_normalized, nickname, license_number, active, needs_review, notes')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await writeAudit({ action: 'edit_driver', target_id: id, ip_address: ip, details: { patch } });
      return NextResponse.json({ success: true, driver: data });
    }

    // -----------------------------------------------------------------
    // merge_trucks / merge_drivers — combine a duplicate into a canonical
    // row. Moves all fills from `from_id` to `to_id`, deactivates `from_id`.
    // -----------------------------------------------------------------
    if (action === 'merge_trucks' || action === 'merge_drivers') {
      const fromId = String(body.from_id || '').trim();
      const toId   = String(body.to_id   || '').trim();
      if (!fromId || !toId) return NextResponse.json({ error: 'Missing from_id or to_id' }, { status: 400 });
      if (fromId === toId)  return NextResponse.json({ error: 'from_id and to_id are the same' }, { status: 400 });

      const isTruck = action === 'merge_trucks';
      const fillCol = isTruck ? 'truck_id' : 'driver_id';
      const table   = isTruck ? 'diesel_trucks' : 'diesel_drivers';

      // Move fills
      const mv = await supabaseAdmin
        .from('diesel_fills')
        .update({ [fillCol]: toId })
        .eq(fillCol, fromId)
        .select('id');
      if (mv.error) return NextResponse.json({ error: mv.error.message }, { status: 500 });

      // Deactivate the duplicate (don't delete — preserves audit trail)
      const dx = await supabaseAdmin
        .from(table)
        .update({
          active: false,
          needs_review: false,
          notes: `Merged into ${toId} on ${new Date().toISOString()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fromId);
      if (dx.error) return NextResponse.json({ error: dx.error.message }, { status: 500 });

      await writeAudit({
        action,
        target_id: toId,
        ip_address: ip,
        details: { from_id: fromId, to_id: toId, fills_moved: mv.data?.length ?? 0 },
      });
      return NextResponse.json({ success: true, fills_moved: mv.data?.length ?? 0 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
