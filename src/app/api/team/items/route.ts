import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import { verifyShopSessionToken } from '@/lib/shop-session';

const ALLOWED_FIELDS = [
  'item_name',
  'brand',
  'product_type',
  'description',
  'category',
  'condition',
  'sale_price',
  'shop_source',
  'shop_label',
  'duty_manager',
  'barcode',
  'image_urls',
  'thumbnail_url',
  'uploaded_by',
  'condition_notes',
  'seo_title',
  'seo_description',
] as const;

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenShop = token ? verifyShopSessionToken(token) : null;
  if (!tokenShop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`team-items-${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { action?: string; item?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (body.action !== 'insert_item' || !body.item) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const incoming = body.item;
  if (!incoming.item_name || !incoming.category) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (incoming.shop_label && incoming.shop_label !== tokenShop) {
    return NextResponse.json({ error: 'Shop mismatch' }, { status: 403 });
  }

  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in incoming) safe[key] = incoming[key];
  }
  safe.shop_label = tokenShop;
  safe.is_published = false;
  safe.is_sold = false;

  const { error } = await supabaseAdmin.from('shop_items').insert(safe);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
