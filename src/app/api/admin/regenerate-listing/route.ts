import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import {
  buildItemListingPrompt,
  callGeminiVision,
  extractJsonObject,
  type ImageInput,
  type ListingContext,
} from '@/lib/gemini';

const MAX_IMAGES_PER_ITEM = 4;
const MAX_BYTES_PER_IMAGE = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// POST /api/admin/regenerate-listing
// Body: { id: string, context?: Partial<ListingContext> }
// The optional `context` overrides the DB columns — used when the admin has
// edited brand/category/condition in the EditPanel but not yet saved, so the
// regeneration matches what they're about to write.
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

  const urls: string[] = (item.image_urls ?? []).slice(0, MAX_IMAGES_PER_ITEM);
  if (urls.length === 0 && item.thumbnail_url) urls.push(item.thumbnail_url);
  if (urls.length === 0) {
    return NextResponse.json({ error: 'Item has no photos to regenerate from' }, { status: 400 });
  }

  let images: ImageInput[];
  try {
    images = await Promise.all(urls.map(fetchImageAsBase64));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image fetch failed';
    return NextResponse.json({ error: msg }, { status: 502 });
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
    return NextResponse.json({ error: result.error || 'Gemini error' }, { status: 502 });
  }

  const parsed = extractJsonObject(result.text) as { title?: string; description?: string } | null;
  if (!parsed?.title && !parsed?.description) {
    return NextResponse.json(
      { error: 'AI returned no usable title or description', raw: result.text },
      { status: 502 }
    );
  }

  return NextResponse.json({
    title: parsed.title ?? null,
    description: parsed.description ?? null,
  });
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
