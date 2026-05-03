import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import {
  buildItemListingPrompt,
  callGeminiVision,
  parseListingResponse,
  type ImageInput,
  type ListingContext,
} from '@/lib/gemini';

const MAX_IMAGES_PER_ITEM = 4;
const MAX_BYTES_PER_IMAGE = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export const maxDuration = 60;

// POST /api/admin/regenerate-listing
// Body: { id: string, context?: Partial<ListingContext> }
//
// Sprint 4 hotfix: response shape standardised. The endpoint always returns
// HTTP 200 once the request is recognised; success/failure is on the JSON
// body so the admin UI can show "AI couldn't read the photos, fill manually"
// instead of crashing on a 502.
//
// Success: { success: true, title, description }
// Soft failure (AI/parse): { success: false, reason: 'ai_parse_failed' | 'gemini_error' | 'image_fetch_failed' | 'no_photos', detail?: string }
// Hard errors (auth, ratelimit, missing key, bad body, item not found) keep
// their non-200 status — those are bugs the admin can't recover from inline.
export async function POST(request: NextRequest) {
  const admin = verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-regenerate-${ip}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API key not configured on server' },
      { status: 500 }
    );
  }

  let id: string | undefined;
  let contextOverride: Partial<ListingContext> | undefined;
  try {
    const body = await request.json();
    id = body?.id;
    contextOverride = body?.context;
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('shop_items')
    .select(
      'id, image_urls, thumbnail_url, brand, category, condition, condition_notes, shop_source, sale_price'
    )
    .eq('id', id)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // From here on, never throw. Wrap everything in try/catch and degrade
  // gracefully so the admin UI always gets a structured response.
  try {
    const urls: string[] = (item.image_urls ?? []).slice(0, MAX_IMAGES_PER_ITEM);
    if (urls.length === 0 && item.thumbnail_url) urls.push(item.thumbnail_url);
    if (urls.length === 0) {
      return NextResponse.json({ success: false, reason: 'no_photos' });
    }

    const fetched = await Promise.allSettled(urls.map(fetchImageAsBase64));
    const images: ImageInput[] = [];
    for (const r of fetched) {
      if (r.status === 'fulfilled') images.push(r.value);
      else console.error('[regenerate-listing] image fetch rejected', r.reason);
    }
    if (images.length === 0) {
      return NextResponse.json({ success: false, reason: 'image_fetch_failed' });
    }

    const context: ListingContext = {
      brand: contextOverride?.brand ?? item.brand,
      category: contextOverride?.category ?? item.category,
      condition: contextOverride?.condition ?? item.condition,
      condition_notes: contextOverride?.condition_notes ?? item.condition_notes,
      shop: contextOverride?.shop ?? item.shop_source ?? 'Ajman',
      price: contextOverride?.price ?? item.sale_price,
    };

    const prompt = buildItemListingPrompt(context);
    const result = await callGeminiVision({ apiKey, prompt, images });

    if (!result.ok) {
      console.error('[regenerate-listing] gemini call failed', { id, error: result.error });
      return NextResponse.json({
        success: false,
        reason: 'gemini_error',
        detail: result.error,
      });
    }

    const parsed = parseListingResponse(result.text);
    if (!parsed.title && !parsed.description) {
      console.error('[regenerate-listing] parse produced no title or description', {
        id,
        preview: result.text.slice(0, 500),
      });
      return NextResponse.json({
        success: false,
        reason: 'ai_parse_failed',
      });
    }

    return NextResponse.json({
      success: true,
      title: parsed.title,
      description: parsed.description,
    });
  } catch (err) {
    // Last-ditch catch for anything we missed. Always 200 so the admin UI
    // shows "AI couldn't read it, fill manually" and never a generic 502.
    console.error('[regenerate-listing] unexpected error', err);
    return NextResponse.json({
      success: false,
      reason: 'ai_parse_failed',
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

async function fetchImageAsBase64(url: string): Promise<ImageInput> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = ALLOWED_MIME.includes(contentType) ? contentType : 'image/jpeg';

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES_PER_IMAGE) {
    throw new Error('Image too large to regenerate');
  }
  return { base64: buf.toString('base64'), mimeType };
}
