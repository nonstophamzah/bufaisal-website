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

      spare_part_analysis: `This is a photo of a spare appliance part label (harvested from a scrap appliance). Extract the identifying info printed on the label. Return a JSON object with these fields:
- part_barcode: the barcode number printed on the label, or null if unreadable
- part_label_text: the full descriptive text printed on the label, combined into a single short string (e.g. "Compressor LG LDA-204V 220V 50Hz"). Keep it under 120 characters. Null if nothing readable.
- part_type: best guess of what kind of part this is, from this exact list: "compressor", "motor", "pcb", "thermostat", "drum", "door_seal", "heating_element", "fan", "pump", "control_board", "valve", "sensor", "wiring", "other". Use "other" if unsure.
- part_brand: the manufacturer if visible (e.g. "LG", "Samsung", "Bosch", "Embraco"), else null
- part_model: the model/part number if clearly visible, else null
- confidence: 0.0-1.0 — how confident you are in the barcode and label text
- readable: true if you could extract useful info, false otherwise

Rules:
- Do NOT guess the barcode — if digits are obscured, return null.
- part_type must be one of the exact values above.
- If the image is not a part label (wrong photo, blurry), return readable=false and null fields except part_type="other".

Return ONLY the JSON object, no other text.`,

      appliance_analysis: `Analyze this image of a used appliance. Return a JSON object with these fields:
- product_type: one of these exact values: "Refrigerator", "Washing Machine", "Dishwasher", "Freezer", "Microwave", "Gas Stove", "Electric Stove", "Clothes Dryer", "Water Cooler", "Oven", "Air Water Cooler", "Other"
- brand: the brand if visible, or "Unknown"
- condition: one of these exact values: "working", "not_working", "scrap"
- problems: array of visible problems from: "No power", "Not cooling", "Leaking", "Part missing", "Other" — empty array if none visible

Return ONLY the JSON object, no other text.`,

      diesel_plate: `This is a photo of a UAE vehicle licence plate. Extract the plate number.

UAE plates typically show:
- An emirate code (e.g. "AD" Abu Dhabi, "DXB" Dubai, "SHJ" Sharjah, "AJM" Ajman) or Arabic text
- A category letter or number (e.g. "A", "B", "C", "1", "2")
- A plate number (1-5 digits)

Return JSON only:
{"plate_number": "the full plate as displayed (emirate + category + number, e.g. AJM-A-12345)", "plate_digits": "just the numeric portion", "confidence": 0.0-1.0, "readable": true/false}

If the plate is unreadable, return: {"plate_number": null, "plate_digits": null, "confidence": 0, "readable": false}
Return ONLY the JSON object, no other text.`,

      diesel_odometer: `This is a photo of a vehicle odometer reading (dashboard). Extract the total kilometers shown.

Rules:
- Read the "TOTAL" or main odometer (NOT the trip meter if both are visible)
- Return only whole kilometers (ignore tenths if separated by decimal)
- If you cannot clearly read all digits, mark unreadable — do NOT guess

Return JSON only:
{"odometer_km": number_or_null, "confidence": 0.0-1.0, "readable": true/false, "notes": "optional short note if ambiguous"}

If unreadable: {"odometer_km": null, "confidence": 0, "readable": false, "notes": "why"}
Return ONLY the JSON object, no other text.`,

      diesel_pump: `This is a photo of a diesel fuel pump display at a station. Extract the liters dispensed for the current fill.

Rules:
- "Liters" or "Quantity" or volume field — NOT price or rate
- Return liters as a decimal number (e.g. 45.20)
- If multiple numbers visible, return the one labelled liters/volume/quantity
- Do NOT guess — if unsure which number is liters, mark unreadable

Return JSON only:
{"liters": number_or_null, "amount_aed": number_or_null, "confidence": 0.0-1.0, "readable": true/false, "notes": "optional"}

If unreadable: {"liters": null, "amount_aed": null, "confidence": 0, "readable": false, "notes": "why"}
Return ONLY the JSON object, no other text.`,

      diesel_license: `This is a photo of a UAE driving licence. Extract the driver identity fields.

UAE driving licences typically show (both Arabic and English):
- Full name (English side preferred, else transliterate from Arabic)
- Licence number (8-10 digits, near "Licence No." / "Traffic Code No.")
- Nationality
- Date of birth
- Expiry date

Rules:
- Return the NAME AS PRINTED in English. Do not guess spelling.
- If only Arabic is visible, return the Arabic text as-is in "full_name_arabic" and leave "full_name" null.
- "license_number" is the primary licence / traffic file number.
- If the image is not a UAE driving licence (wrong document, blurry), return readable=false.
- Do NOT invent fields. Prefer null over guessing.

Return JSON only:
{"full_name": "string_or_null", "full_name_arabic": "string_or_null", "license_number": "string_or_null", "nationality": "string_or_null", "expiry_date": "YYYY-MM-DD_or_null", "confidence": 0.0-1.0, "readable": true/false, "notes": "optional"}

If unreadable: {"full_name": null, "full_name_arabic": null, "license_number": null, "nationality": null, "expiry_date": null, "confidence": 0, "readable": false, "notes": "why"}
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
