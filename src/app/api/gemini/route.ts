import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64_SIZE = 10 * 1024 * 1024; // ~10MB base64

export async function POST(request: NextRequest) {
  try {
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

    const { imageBase64, mimeType, prompt: customPrompt } = await request.json();

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

    const defaultPrompt = `Analyze this image of a used item for sale in a second-hand store. Return a JSON object with these fields:
- item_name: a clear, concise name for this item
- brand: the brand if visible, or "Unknown"
- description: a short 1-2 sentence description of the item's condition and features
- category: one of these exact values: "Living Room & Lounge", "Bedroom & Sleep", "Kitchen & Dining", "Appliances", "Outdoor & Garden", "Kids & Baby", "Office, Study & Fitness", "Everyday Essentials"
- condition: one of these exact values: "Excellent", "Good", "Fair"
- seo_title: a short SEO-friendly title for this product listing (under 60 characters)
- seo_description: a 1-2 sentence SEO meta description for this listing

Return ONLY the JSON object, no other text.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: customPrompt || defaultPrompt },
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
