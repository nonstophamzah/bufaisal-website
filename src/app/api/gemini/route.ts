import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64_SIZE = 10 * 1024 * 1024; // ~10MB base64

export async function POST(request: NextRequest) {
  try {
    if (!verifyOrigin(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const { allowed } = rateLimit(`gemini-${ip}`, 10, 60_000);
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

    const { imageBase64, mimeType, action } = await request.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing imageBase64 or mimeType' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid image type. Use JPEG, PNG, or WebP.' },
        { status: 400 }
      );
    }

    // Validate size
    if (imageBase64.length > MAX_BASE64_SIZE) {
      return NextResponse.json(
        { error: 'Image too large. Max 10MB.' },
        { status: 400 }
      );
    }

    // All prompts defined server-side — clients select by action name
    const PROMPTS: Record<string, string> = {
      item_analysis: `Analyze this image of a used item for sale in a second-hand store. Return a JSON object with these fields:
- item_name: a clear, concise name for this item
- brand: the brand if visible, or "Unknown"
- description: a short 1-2 sentence description of the item's condition and features
- category: one of these exact values: "Living Room & Lounge", "Bedroom & Sleep", "Kitchen & Dining", "Appliances", "Outdoor & Garden", "Kids & Baby", "Office, Study & Fitness", "Everyday Essentials"
- condition: one of these exact values: "Excellent", "Good", "Fair"
- seo_title: a short SEO-friendly title for this product listing (under 60 characters)
- seo_description: a 1-2 sentence SEO meta description for this listing

Return ONLY the JSON object, no other text.`,

      barcode_scan: `Read the barcode number from this label photo. Return JSON only: {"barcode": "the number or null"}`,

      appliance_analysis: `Analyze this image of a used appliance. Return a JSON object with these fields:
- product_type: one of these exact values: "Refrigerator", "Washing Machine", "Dishwasher", "Freezer", "Microwave", "Gas Stove", "Electric Stove", "Clothes Dryer", "Water Cooler", "Oven", "Air Water Cooler", "Other"
- brand: the brand if visible, or "Unknown"
- condition: one of these exact values: "working", "not_working", "scrap"
- problems: array of visible problems from: "No power", "Not cooling", "Leaking", "Part missing", "Other" — empty array if none visible

Return ONLY the JSON object, no other text.`,
    };

    const prompt = PROMPTS[action || 'item_analysis'] || PROMPTS.item_analysis;

    // DO NOT CHANGE THIS MODEL — paid Tier 1 account, gemini-2.5-flash-lite only
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message || `Gemini API error (${res.status})`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
