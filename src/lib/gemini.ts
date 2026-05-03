// Shared Gemini helpers used by /api/gemini (worker /team flow),
// /api/admin/regenerate-listing (admin "regenerate" button), and
// /api/jobs/generate-listing (background AI job from Sprint 4).
//
// The new item_analysis prompt follows SEO-AGENT.md §5: title format
// "Used [Brand] [Item Type] [Key Spec]", description 30-50 words, no fluff.
//
// Sprint 4 hotfix: every function in this file is defensive — no path
// throws to the caller. callGeminiVision returns a discriminated result;
// the parsers return null on any failure and console.error a preview of
// the raw response so future failures are debuggable from Vercel logs.

export type ImageInput = { base64: string; mimeType: string };

export type ListingContext = {
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
  condition_notes?: string | null;
  shop?: string | null;
  price?: number | string | null;
};

export type ListingOutput = {
  title: string | null;
  description: string | null;
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

Output format — strictly enforced:
Return ONLY valid JSON with no markdown code fences, no preamble, no explanation, no trailing prose. Use this exact shape:
{"title": "...", "description": "..."}

If you cannot generate a usable listing from the photos (image is unreadable, content is not a sellable item, etc.), return:
{"title": null, "description": null}`;
}

// Calls Gemini with a prompt + multiple inline images. Never throws —
// transport / parse / Gemini-error failures are all converted into
// { ok: false, error, status }.
//
// Sprint 4 hotfix: also requests responseMimeType=application/json so
// Gemini emits raw JSON instead of markdown-fenced text.
export async function callGeminiVision(opts: {
  apiKey: string;
  prompt: string;
  images: ImageInput[];
}): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  let res: Response;
  try {
    res = await fetch(
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
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini transport error';
    console.error('[gemini] fetch threw', err);
    return { ok: false, text: '', status: 0, error: msg };
  }

  // Read body as text first so we can log it on parse failure.
  const rawBody = await res.text().catch(() => '');

  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error('[gemini] non-JSON response body', {
      status: res.status,
      preview: rawBody.slice(0, 800),
    });
    return {
      ok: false,
      text: '',
      status: res.status,
      error: `Gemini returned non-JSON (HTTP ${res.status})`,
    };
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const errObj = obj.error as { message?: string } | undefined;
  if (!res.ok || errObj) {
    const msg = errObj?.message || `Gemini API error (${res.status})`;
    console.error('[gemini] api error', { status: res.status, error: msg });
    return { ok: false, text: '', status: res.status, error: msg };
  }

  const candidates = obj.candidates as Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }> | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const finishReason = candidates?.[0]?.finishReason;

  if (!text) {
    // 200 with empty candidates — typically a safety filter rejection.
    console.error('[gemini] empty candidate text', {
      finishReason,
      preview: rawBody.slice(0, 800),
    });
    return {
      ok: false,
      text: '',
      status: res.status,
      error: `Gemini returned no text (finishReason: ${finishReason ?? 'unknown'})`,
    };
  }

  return { ok: true, text, status: 200 };
}

// Strip markdown code fences and surrounding whitespace if present.
function stripMarkdownFences(text: string): string {
  let s = text.trim();
  // Leading ```json or ```
  s = s.replace(/^```(?:json)?\s*\n?/i, '');
  // Trailing ```
  s = s.replace(/\n?\s*```\s*$/i, '');
  return s.trim();
}

// Multi-strategy JSON object extractor. Returns null on any failure and
// logs a preview of the raw text so future failures are debuggable.
export function extractJsonObject(text: string): unknown | null {
  if (!text || typeof text !== 'string') return null;

  const stripped = stripMarkdownFences(text);

  // Strategy 1: direct parse on the stripped text.
  try {
    return JSON.parse(stripped);
  } catch {
    /* fallthrough */
  }

  // Strategy 2: regex-extract the first {...} block (greedy, last brace).
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* fallthrough */
    }
  }

  console.error('[gemini] extractJsonObject failed', { preview: text.slice(0, 500) });
  return null;
}

// Parse a {title, description} listing response from Gemini, with multiple
// fallbacks. Returns { title: null, description: null } if every strategy
// fails, never throws.
//
// 1. JSON.parse on the stripped text (covers JSON-mode happy path)
// 2. Regex {...} block + JSON.parse (covers prose around JSON)
// 3. "Title:" / "Description:" plain-text labels (covers prose-only output)
export function parseListingResponse(text: string): ListingOutput {
  const out: ListingOutput = { title: null, description: null };
  if (!text || typeof text !== 'string') return out;

  const obj = extractJsonObject(text);
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if (typeof o.title === 'string' && o.title.trim()) out.title = o.title.trim();
    if (typeof o.description === 'string' && o.description.trim()) {
      out.description = o.description.trim();
    }
    if (out.title || out.description) return out;
  }

  // Plain-text fallback. Captures lines like:
  //   Title: Used Bosch Refrigerator 500L
  //   Description: Working condition. ...
  const titleMatch = text.match(/^\s*(?:title|TITLE)\s*[:\-]\s*(.+?)\s*$/im);
  const descMatch = text.match(
    /(?:^|\n)\s*(?:description|DESCRIPTION)\s*[:\-]\s*([\s\S]+?)(?=\n\s*[A-Z][a-z]+\s*[:\-]|$)/i
  );
  if (titleMatch) out.title = titleMatch[1].trim() || null;
  if (descMatch) out.description = descMatch[1].trim() || null;

  if (!out.title && !out.description) {
    console.error('[gemini] parseListingResponse: no usable output', {
      preview: text.slice(0, 500),
    });
  }
  return out;
}
