import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import {
  getClientIp,
  logSecurityEvent,
  logApiError,
  recordAdminIp,
  logOriginRejectionFor,
} from '@/lib/security-log';

// Allowed fields for appliance insert/update to prevent arbitrary column writes
const ALLOWED_INSERT_FIELDS = [
  'barcode', 'product_type', 'brand', 'status', 'condition',
  'location_status', 'problems', 'shop', 'photo_url', 'needs_jurf',
  'date_received', 'tested_by', 'repair_notes', 'repair_cost',
  'destination_shop', 'created_by', 'approval_status',
];
const ALLOWED_UPDATE_FIELDS = [
  'status', 'condition', 'location_status', 'problems', 'photo_url',
  'needs_jurf', 'date_sent_to_jurf', 'tested_by', 'repair_notes',
  'repair_cost', 'destination_shop', 'approval_status',
  'date_received', 'brand', 'product_type', 'barcode',
  // cleaning workflow
  'cleaning_status', 'cleaned_by', 'date_cleaning_claimed', 'date_cleaned',
  'before_cleaning_photos', 'after_cleaning_photos',
  'cleaning_flagged', 'cleaning_flag_note', 'cleaning_flagged_at',
  // Jurf / shop lifecycle (already written by code, adding for safety)
  'claimed_by', 'date_claimed', 'date_repaired', 'date_sent_to_shop',
  'date_received_jurf', 'date_accepted_at_shop',
];

function sanitizeFields(obj: Record<string, unknown>, allowedKeys: string[]): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in obj) safe[key] = obj[key];
  }
  return safe;
}

// Allowed filter/order columns to prevent arbitrary column queries
const ALLOWED_QUERY_COLUMNS = [
  'id', 'barcode', 'product_type', 'brand', 'status', 'condition',
  'location_status', 'shop', 'needs_jurf', 'date_received',
  'date_sent_to_jurf', 'tested_by', 'destination_shop', 'created_by',
  'created_at', 'approval_status', 'repair_cost',
  // Jurf / cleaning lifecycle fields
  'claimed_by', 'cleaning_status', 'cleaned_by', 'cleaning_flagged',
  'date_claimed', 'date_repaired', 'date_cleaned',
];

// Allowed part_type values — keep in lockstep with the Gemini spare_part_analysis prompt
const ALLOWED_PART_TYPES = new Set([
  'compressor', 'motor', 'pcb', 'thermostat', 'drum', 'door_seal',
  'heating_element', 'fan', 'pump', 'control_board', 'valve', 'sensor',
  'wiring', 'other',
]);

/**
 * Best-effort actor attribution for the security audit log.
 *
 * Why this is best-effort: the appliance API takes the actor's name embedded
 * inside a domain object (e.g. `body.item.created_by`, `body.installed_by`,
 * `body.updates.cleaned_by`) rather than as a uniform top-level field. This
 * helper checks the known candidate fields per action shape and returns the
 * first non-empty string, falling back to null.
 *
 * Returning null is fine and intentional. The IP, action name, and timestamp
 * are still logged via logApplianceAction(), so a null actor + IP remains
 * useful for forensic correlation — you can still see "an action of type X
 * happened from IP Y at time T" even when the body didn't carry an actor.
 *
 * If a new mutating action is added, extend the candidates list below.
 */
function pickActor(action: string, body: Record<string, unknown>): string | null {
  const u = body.updates as Record<string, unknown> | undefined;
  const item = body.item as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    body.installed_by,
    item?.created_by, item?.tested_by,
    u?.cleaned_by, u?.tested_by, u?.claimed_by,
    body.cleaned_by, body.tested_by, body.claimed_by,
    body.actor,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Logs a successful mutating action to security_events and runs the
 * (user_name, ip) novelty check. MUST be called only AFTER the DB write
 * has resolved without error — otherwise we'd record actions that didn't
 * actually happen.
 */
async function logApplianceAction(
  action: string,
  ip: string,
  user_name: string | null,
  details: Record<string, unknown>
): Promise<void> {
  void logSecurityEvent({
    event_type: 'admin_action',
    severity: 'info',
    ip,
    user_name,
    route: '/api/appliances',
    details: { action, ...details },
  });
  if (user_name) {
    const novel = await recordAdminIp(user_name, ip);
    if (novel) {
      void logSecurityEvent({
        event_type: 'new_admin_ip',
        severity: 'warn',
        ip,
        user_name,
        route: '/api/appliances',
      });
    }
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (!verifyOrigin(request)) {
    logOriginRejectionFor(request, '/api/appliances');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { allowed } = rateLimit(`appliance-${ip}`, 30, 60_000);
  if (!allowed) {
    void logSecurityEvent({
      event_type: 'rate_limit_hit',
      severity: 'warn',
      ip,
      route: '/api/appliances',
    });
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { action, ...body } = await request.json();

    // --- Config reads (code checks with dedicated rate limit) ---
    if (action === 'check_entry_code' || action === 'check_manager_code') {
      // Tighter rate limit for code brute-force protection
      const { allowed: codeAllowed } = rateLimit(`code-check-${ip}`, 5, 60_000);
      if (!codeAllowed) {
        void logSecurityEvent({
          event_type: 'rate_limit_hit',
          severity: 'warn',
          ip,
          route: '/api/appliances',
          details: { sub: 'code-check' },
        });
        return NextResponse.json({ error: 'Too many attempts. Try again in 1 minute.' }, { status: 429 });
      }

      const configKey = action === 'check_entry_code' ? 'entry_code' : 'manager_code';
      const { data } = await supabaseAdmin
        .from('appliance_config')
        .select('value')
        .eq('key', configKey)
        .maybeSingle();

      if (!data?.value || !body.code) {
        return NextResponse.json({ match: false });
      }

      // Support both bcrypt hashes and plain text (for migration)
      let match = false;
      if (data.value.startsWith('$2a$') || data.value.startsWith('$2b$')) {
        match = await bcrypt.compare(String(body.code), data.value);
      } else {
        // Plain text fallback — log warning for migration
        match = data.value === body.code;
      }
      if (!match) {
        void logSecurityEvent({
          event_type: 'failed_code_check',
          severity: 'warn',
          ip,
          route: '/api/appliances',
          details: { which: configKey },
        });
      }
      return NextResponse.json({ match });
    }

    // --- Workers ---
    if (action === 'get_workers') {
      const { data } = await supabaseAdmin
        .from('appliance_workers')
        .select('id, name, role, tab')
        .order('name');
      return NextResponse.json({ workers: data || [] });
    }

    // --- Items: read ---
    if (action === 'get_items') {
      let query = supabaseAdmin.from('appliance_items').select(body.columns || '*');
      if (body.filter) {
        for (const [key, val] of Object.entries(body.filter)) {
          if (ALLOWED_QUERY_COLUMNS.includes(key)) {
            query = query.eq(key, val as string);
          }
        }
      }
      if (body.is_null) {
        for (const col of body.is_null as string[]) {
          if (ALLOWED_QUERY_COLUMNS.includes(col)) {
            query = query.is(col, null);
          }
        }
      }
      if (body.order && ALLOWED_QUERY_COLUMNS.includes(body.order.column)) {
        query = query.order(body.order.column, { ascending: body.order.ascending ?? false });
      }
      const limit = Math.min(Number(body.limit) || 500, 1000);
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ items: data || [] });
    }

    // --- Items: insert (field-whitelisted) ---
    if (action === 'insert_item') {
      const safeItem = sanitizeFields(body.item || {}, ALLOWED_INSERT_FIELDS);
      if (!safeItem.product_type && !safeItem.barcode) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('appliance_items').insert(safeItem);
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // DB write succeeded — log AFTER success, never before
      await logApplianceAction(action, ip, pickActor(action, body), {
        product_type: safeItem.product_type,
        shop: safeItem.shop,
      });
      return NextResponse.json({ success: true });
    }

    // --- Items: update (field-whitelisted) ---
    if (action === 'update_item') {
      const { id, updates } = body;
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const safeUpdates = sanitizeFields(updates || {}, ALLOWED_UPDATE_FIELDS);
      const { error } = await supabaseAdmin
        .from('appliance_items')
        .update(safeUpdates)
        .eq('id', id);
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await logApplianceAction(action, ip, pickActor(action, body), {
        id,
        fields: Object.keys(safeUpdates),
      });
      return NextResponse.json({ success: true });
    }

    // --- Items: bulk update (field-whitelisted) ---
    if (action === 'bulk_update_items') {
      const { ids, updates } = body;
      if (!ids?.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
      const safeUpdates = sanitizeFields(updates || {}, ALLOWED_UPDATE_FIELDS);
      const { error } = await supabaseAdmin
        .from('appliance_items')
        .update(safeUpdates)
        .in('id', ids);
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await logApplianceAction(action, ip, pickActor(action, body), {
        count: ids.length,
        fields: Object.keys(safeUpdates),
      });
      return NextResponse.json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // SPARE PARTS USAGE (v1 — log only, no shelf/harvest/failure yet)
    // ═══════════════════════════════════════════════════════════════════

    // --- Log spare part installed into a repair item ---
    if (action === 'log_spare_part_usage') {
      const {
        part_barcode, part_label_text, part_type,
        installed_in_item_id, installed_by, photo_url, notes,
      } = body;

      // Required fields
      if (!part_barcode || typeof part_barcode !== 'string' || !part_barcode.trim()) {
        return NextResponse.json({ error: 'Missing part barcode' }, { status: 400 });
      }
      if (!installed_in_item_id || typeof installed_in_item_id !== 'string') {
        return NextResponse.json({ error: 'Missing receiving item id' }, { status: 400 });
      }
      if (!installed_by || typeof installed_by !== 'string' || !installed_by.trim()) {
        return NextResponse.json({ error: 'Missing worker name' }, { status: 400 });
      }
      if (!photo_url || typeof photo_url !== 'string' || !photo_url.startsWith('http')) {
        return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
      }

      // Normalise part_type — reject unknown values, default to 'other'
      const safePartType =
        part_type && ALLOWED_PART_TYPES.has(String(part_type)) ? String(part_type) : 'other';

      // Validate receiving item exists, is claimed by this worker, and is still
      // in a state where parts can be logged. Allow in_repair (active) and
      // repaired (just-finished, grace window) — anything later is blocked.
      const { data: item, error: itemError } = await supabaseAdmin
        .from('appliance_items')
        .select('id, claimed_by, location_status')
        .eq('id', installed_in_item_id)
        .maybeSingle();

      if (itemError) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: itemError.message });
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }
      if (!item) {
        return NextResponse.json({ error: 'Receiving item not found' }, { status: 404 });
      }
      if (item.claimed_by !== installed_by) {
        return NextResponse.json(
          { error: 'You can only log parts to items you have claimed' },
          { status: 403 },
        );
      }
      if (item.location_status !== 'in_repair' && item.location_status !== 'repaired') {
        return NextResponse.json(
          { error: 'Parts can only be logged while the item is being repaired' },
          { status: 400 },
        );
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('appliance_spare_parts_usage')
        .insert({
          part_barcode: String(part_barcode).trim(),
          part_label_text: part_label_text ? String(part_label_text).trim() : null,
          part_type: safePartType,
          installed_in_item_id,
          installed_by: String(installed_by).trim(),
          photo_url,
          notes: notes ? String(notes).trim() : null,
        })
        .select()
        .single();

      if (insertError) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: insertError.message });
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      await logApplianceAction(action, ip, pickActor(action, body), {
        part_type: safePartType,
        item_id: installed_in_item_id,
      });
      return NextResponse.json({ success: true, part: inserted });
    }

    // --- Get parts installed into one item ---
    if (action === 'get_parts_for_item') {
      const { item_id } = body;
      if (!item_id || typeof item_id !== 'string') {
        return NextResponse.json({ error: 'Missing item_id' }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from('appliance_spare_parts_usage')
        .select('*')
        .eq('installed_in_item_id', item_id)
        .order('date_installed', { ascending: false });
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ parts: data || [] });
    }

    // --- Get all parts usage (manager dashboard feed) ---
    if (action === 'get_all_parts_usage') {
      const limit = Math.min(Number(body.limit) || 100, 500);
      const worker = typeof body.worker === 'string' ? body.worker.trim() : '';
      const sinceDays = Number(body.since_days) || 0;

      let query = supabaseAdmin
        .from('appliance_spare_parts_usage')
        .select('*')
        .order('date_installed', { ascending: false })
        .limit(limit);

      if (worker) query = query.eq('installed_by', worker);
      if (sinceDays > 0) {
        const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('date_installed', cutoff);
      }

      const { data, error } = await query;
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ parts: data || [] });
    }

    // --- Delete a parts-usage row (manager correction) ---
    if (action === 'delete_parts_usage') {
      const { id } = body;
      if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      }
      const { error } = await supabaseAdmin
        .from('appliance_spare_parts_usage')
        .delete()
        .eq('id', id);
      if (error) {
        void logApiError(request, 500, { route: '/api/appliances', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await logApplianceAction(action, ip, pickActor(action, body), { id });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    void logApiError(request, 500, {
      route: '/api/appliances',
      error_message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
