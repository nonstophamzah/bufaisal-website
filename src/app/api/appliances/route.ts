import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';

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

    // --- Config reads ---
    if (action === 'check_entry_code') {
      const { data } = await supabaseAdmin
        .from('appliance_config')
        .select('value')
        .eq('key', 'entry_code')
        .maybeSingle();
      return NextResponse.json({ match: data?.value === body.code });
    }

    if (action === 'check_manager_code') {
      const { data } = await supabaseAdmin
        .from('appliance_config')
        .select('value')
        .eq('key', 'manager_code')
        .maybeSingle();
      return NextResponse.json({ match: data?.value === body.code });
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
          query = query.eq(key, val as string);
        }
      }
      if (body.order) {
        query = query.order(body.order.column, { ascending: body.order.ascending ?? false });
      }
      if (body.limit) {
        query = query.limit(body.limit);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ items: data || [] });
    }

    // --- Items: insert ---
    if (action === 'insert_item') {
      const { error } = await supabaseAdmin.from('appliance_items').insert(body.item);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // --- Items: update ---
    if (action === 'update_item') {
      const { id, updates } = body;
      const { error } = await supabaseAdmin
        .from('appliance_items')
        .update(updates)
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // --- Items: bulk update ---
    if (action === 'bulk_update_items') {
      const { ids, updates } = body;
      const { error } = await supabaseAdmin
        .from('appliance_items')
        .update(updates)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
