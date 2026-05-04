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
  'negotiable',
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
  // PR #13: item_name is optional. The async AI job will fill it from
  // photos if blank. Category is still required so the listing can be
  // routed correctly while the AI is working.
  if (!incoming.category) {
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
  // PR #12: server-side default. If the client omits negotiable, treat
  // the item as negotiable (matches the database default and keeps
  // legacy /team clients working unchanged).
  if (typeof safe.negotiable !== 'boolean') safe.negotiable = true;
  // Sprint 4: kick off the agent pipeline. Background job will flip this to
  // 'pending_review' (success or failure) so admins always see the item.
  safe.status = 'agent_drafting';

  const { data: inserted, error } = await supabaseAdmin
    .from('shop_items')
    .insert(safe)
    .select('id')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Fire-and-forget: kick the AI job. The worker's response does not depend
  // on it. If JOBS_SECRET isn't configured the item just sits in
  // agent_drafting and the admin can fill it manually — that's documented.
  kickoffListingJob(request, inserted.id as string);

  return NextResponse.json({ success: true, id: inserted.id });
}

function kickoffListingJob(request: NextRequest, itemId: string): void {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    console.warn('[team-items] JOBS_SECRET missing — agent pipeline disabled');
    return;
  }
  const origin = new URL(request.url).origin;
  // Unawaited on purpose. Vercel keeps the function alive briefly after the
  // response, which is enough to flush the request to the network. The job
  // route is idempotent on status, so any duplicate fires are no-ops.
  fetch(`${origin}/api/jobs/generate-listing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jobs-secret': secret,
    },
    body: JSON.stringify({ item_id: itemId }),
  }).catch((err) => {
    console.error('[team-items] kickoff failed', itemId, err);
  });
}
