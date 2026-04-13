import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';

// Verify the request comes from an authenticated admin
function verifyAdmin(request: NextRequest): string | null {
  if (!verifyOrigin(request)) return null;
  const adminName = request.headers.get('x-admin-name');
  return adminName || null;
}

export async function POST(request: NextRequest) {
  const admin = verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-items-${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { action, ...body } = await request.json();

    // ── READ: Get items with filters ──
    if (action === 'get_items') {
      let query = supabaseAdmin.from('shop_items').select(body.columns || '*');
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

    // ── INSERT: Create new item (team upload) ──
    if (action === 'insert_item') {
      const { item } = body;
      if (!item?.item_name || !item?.category) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('shop_items').insert(item);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── APPROVE: Publish an item ──
    if (action === 'approve') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_published: true, approved_by: admin, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── BULK APPROVE ──
    if (action === 'bulk_approve') {
      const { ids } = body;
      if (!ids?.length) return NextResponse.json({ error: 'No items selected' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_published: true, approved_by: admin, approved_at: new Date().toISOString() })
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── REJECT: Delete a pending item ──
    if (action === 'reject') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin.from('shop_items').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── BULK REJECT: Delete multiple pending items ──
    if (action === 'bulk_reject') {
      const { ids } = body;
      if (!ids?.length) return NextResponse.json({ error: 'No items selected' }, { status: 400 });
      const { error } = await supabaseAdmin.from('shop_items').delete().in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── MARK SOLD ──
    if (action === 'mark_sold') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_sold: true })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── UNMARK SOLD ──
    if (action === 'unmark_sold') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_sold: false, is_published: true })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── HIDE ITEM ──
    if (action === 'hide') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_hidden: true, is_published: false })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── UNHIDE ITEM ──
    if (action === 'unhide') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_hidden: false })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── DELETE PERMANENTLY ──
    if (action === 'delete') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin.from('shop_items').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── TOGGLE FEATURED ──
    if (action === 'toggle_featured') {
      const { id, is_featured } = body;
      if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update({ is_featured: !is_featured })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── EDIT ITEM ──
    if (action === 'edit') {
      const { id, updates } = body;
      if (!id || !updates) return NextResponse.json({ error: 'Missing id or updates' }, { status: 400 });
      // Only allow specific fields to be updated
      const allowed = [
        'item_name', 'brand', 'category', 'condition', 'description',
        'sale_price', 'barcode', 'product_type', 'seo_title',
        'seo_description', 'is_featured',
      ];
      const safeUpdates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in updates) safeUpdates[key] = updates[key];
      }
      const { error } = await supabaseAdmin
        .from('shop_items')
        .update(safeUpdates)
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
