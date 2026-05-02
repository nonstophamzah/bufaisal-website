// Shared Gemini helpers used by /api/gemini (worker /team flow) and
// /api/admin/regenerate-listing (admin "regenerate" button on existing items).
// The new item_analysis prompt follows SEO-AGENT.md §5: title format
// "Used [Brand] [Item Type] [Key Spec]", description 30-50 words, no fluff.

export type ImageInput = { base64: string; mimeType: string };

export type ListingContext = {
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
  condition_notes?: string | null;
  shop?: string | null;
  price?: number | string | null;
};

export const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const fmt = (v: unknown) => {
  if (v === null || v === undefined) return '(not provided)';
  const s = String(v).trim();
  return s === '' ? '(not provided)' : s;
};

export function buildItemListingPrompt(ctx: ListingContext): string {
  const brand = fmt(ctx.brand);
  const category = fmt(ctx.category);
  const condition = fmt(ctx.condition);
  const conditionNotes = fmt(ctx.condition_notes);
  const shop = fmt(ctx.shop);
  const price = fmt(ctx.price);

  return `You write product listings for Bufaisal, a UAE used-goods marketplace based in Ajman.

Worker-provided form context — treat as authoritative, do not contradict:
- Brand: ${brand}
- Category: ${category}
- Condition: ${condition}
- Condition notes: ${conditionNotes}
- Shop location: ${shop}
- Price (AED): ${price}

Photos: 1–4 images of the same item.

Generate exactly two outputs.

TITLE
- Under 60 characters.
- Format: "Used [Brand] [Item Type] [Key Spec]".
- Brand and item type front-loaded. Key spec is the most identifying feature: capacity for appliances ("500L", "8kg"), size for furniture ("Queen", "180cm"), screen size for TVs ("55in"), etc.
- If brand is "(not provided)", "Unknown", or not visible in photos, omit it: "Used [Item Type] [Key Spec]".
- Always start with the word "Used".

Examples:
- "Used Bosch Side-by-Side Refrigerator 500L"
- "Used Samsung 8kg Front-Load Washing Machine"
- "Used IKEA MALM Queen Bed Frame White"

DESCRIPTION
- 30–50 words, plain factual English at an 8th-grade reading level.
- Lead with what it is and the condition.
- State whether it has been tested, working, or repaired (use the Condition value above).
- If condition notes is non-empty, incorporate the flaws honestly.
- Mention the Ajman shop location and delivery to Dubai and Sharjah.
- End the description with the exact sentence: Click WhatsApp to negotiate.

Voice rules — strictly enforced:
- No marketing words: "amazing", "stunning", "premium", "luxurious", "perfect", "incredible", "must-have", "high-quality".
- No exclamation marks.
- No emojis in the description text.
- Do not mention the price in the description (price renders separately on the card).

Return strict JSON only, no other text, no markdown fences:
{"title": "string", "description": "string"}`;
}

// Calls Gemini with a prompt + multiple inline images. Returns the raw text
// response (caller is responsible for JSON parsing). Throws on transport error.
export async function callGeminiVision(opts: {
  apiKey: string;
  prompt: string;
  images: ImageInput[];
}): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${opts.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: opts.prompt },
              ...opts.images.map((img) => ({
                inline_data: { mime_type: img.mimeType, data: img.base64 },
              })),
            ],
          },
        ],
      }),
    }
  );

  const data = await res.json();
  if (!res.ok || data.error) {
    return {
      ok: false,
      text: '',
      status: res.status,
      error: data.error?.message || `Gemini API error (${res.status})`,
    };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { ok: true, text, status: 200 };
}

// Pull `{...}` out of a Gemini response that may have stray prose around it.
export function extractJsonObject(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
