import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';

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

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`appliance-${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { action, ...body } = await request.json();

    // --- Config reads (code checks with dedicated rate limit) ---
    if (action === 'check_entry_code' || action === 'check_manager_code') {
      // Tighter rate limit for code brute-force protection
      const { allowed: codeAllowed } = rateLimit(`code-check-${ip}`, 5, 60_000);
      if (!codeAllowed) {
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ items: data || [] });
    }

    // --- Items: insert (field-whitelisted) ---
    if (action === 'insert_item') {
      const safeItem = sanitizeFields(body.item || {}, ALLOWED_INSERT_FIELDS);
      if (!safeItem.product_type && !safeItem.barcode) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('appliance_items').insert(safeItem);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
