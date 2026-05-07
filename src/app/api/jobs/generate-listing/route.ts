import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildItemListingPrompt,
  callAIVision,
  extractJsonObject,
  type ImageInput,
  type ListingContext,
} from '@/lib/ai';

// Sprint 4 / Fix 3: background AI listing generation.
// Triggered via fire-and-forget HTTP from /api/team/items immediately after
// the worker submits. Idempotent: only runs when the row's status is
// 'agent_drafting'. Always transitions the row to 'pending_review' (success
// OR failure) so admins always see the item in the queue.
//
// Auth model: shared secret in `JOBS_SECRET` env var. The team-items route
// includes it on the kickoff call. We do NOT use the standard verifyOrigin
// helper here because Vercel sometimes proxies internal calls without the
// expected Origin header.

const MAX_IMAGES_PER_ITEM = 4;
const MAX_BYTES_PER_IMAGE = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Allow the route to run for up to 60s (default is 10s on hobby/Pro). Claude
// vision can take 20-40s on multi-image listings, plus we fetch images first.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    // Misconfigured deploy — fail loudly so admins notice items aren't being
    // generated, instead of silently leaving them in agent_drafting forever.
    return NextResponse.json(
      { error: 'JOBS_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (request.headers.get('x-jobs-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let itemId: string | undefined;
  try {
    const body = await request.json();
    itemId = body?.item_id;
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }
  if (!itemId) {
    return NextResponse.json({ error: 'Missing item_id' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI key — flip to pending_review with no AI content so the admin
    // sees it and can fill manually. Don't strand the item in drafting.
    await markPendingReview(itemId, null, null, 'ai_key_missing');
    return NextResponse.json({ ok: true, applied: false, reason: 'ai_key_missing' });
  }

  // Idempotency: only process if the row is still in agent_drafting.
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('shop_items')
    .select(
      'id, status, image_urls, thumbnail_url, brand, category, condition, condition_notes, shop_source, sale_price, listing_type'
    )
    .eq('id', itemId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  if (item.status !== 'agent_drafting') {
    // Already processed (or never queued). Treat as success — duplicate
    // kickoffs from a retried fetch are a no-op.
    return NextResponse.json({ ok: true, applied: false, reason: 'already_processed' });
  }

  const urls: string[] = (item.image_urls ?? []).slice(0, MAX_IMAGES_PER_ITEM);
  if (urls.length === 0 && item.thumbnail_url) urls.push(item.thumbnail_url);
  if (urls.length === 0) {
    await markPendingReview(itemId, null, null, 'no_photos');
    return NextResponse.json({ ok: true, applied: false, reason: 'no_photos' });
  }

  // Fetch images. If any single image fails we still try the rest.
  const fetched = await Promise.allSettled(urls.map(fetchImageAsBase64));
  const images: ImageInput[] = [];
  for (const r of fetched) {
    if (r.status === 'fulfilled') images.push(r.value);
  }
  if (images.length === 0) {
    await markPendingReview(itemId, null, null, 'image_fetch_failed');
    return NextResponse.json({ ok: true, applied: false, reason: 'image_fetch_failed' });
  }

  const context: ListingContext = {
    brand: item.brand,
    category: item.category,
    condition: item.condition,
    condition_notes: item.condition_notes,
    listing_type: item.listing_type,
    shop: item.shop_source ?? 'Ajman',
    price: item.sale_price,
  };

  const prompt = buildItemListingPrompt(context);
  const result = await callAIVision({ apiKey, prompt, images });

  if (!result.ok) {
    console.error('[generate-listing] ai error', itemId, result.error);
    await markPendingReview(itemId, null, null, `ai_error:${result.status}`);
    return NextResponse.json({ ok: true, applied: false, reason: 'ai_error' });
  }

  const parsed = extractJsonObject(result.text) as { title?: string; description?: string } | null;
  if (!parsed?.title && !parsed?.description) {
    console.error('[generate-listing] no usable output for', itemId);
    await markPendingReview(itemId, null, null, 'ai_parse_failed');
    return NextResponse.json({ ok: true, applied: false, reason: 'ai_parse_failed' });
  }

  await markPendingReview(itemId, parsed.title ?? null, parsed.description ?? null, null);
  return NextResponse.json({ ok: true, applied: true });
}

async function markPendingReview(
  id: string,
  title: string | null,
  description: string | null,
  failureReason: string | null
) {
  const updates: Record<string, unknown> = { status: 'pending_review' };
  if (title) {
    updates.item_name = title;
    updates.seo_title = title;
  }
  if (description) {
    updates.description = description;
    updates.seo_description = description;
  }
  const { error } = await supabaseAdmin
    .from('shop_items')
    .update(updates)
    .eq('id', id)
    .eq('status', 'agent_drafting'); // belt-and-suspenders idempotency
  if (error) {
    console.error('[generate-listing] update failed', id, failureReason, error);
  }
}

async function fetchImageAsBase64(url: string): Promise<ImageInput> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = ALLOWED_MIME.includes(contentType) ? contentType : 'image/jpeg';

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES_PER_IMAGE) {
    throw new Error('Image too large');
  }
  return { base64: buf.toString('base64'), mimeType };
}
