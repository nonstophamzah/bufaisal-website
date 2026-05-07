// Provider-agnostic AI helpers used by /api/gemini (worker /team flow),
// /api/admin/regenerate-listing (admin "regenerate" button), and
// /api/jobs/generate-listing (background async job from PR #9).
//
// Migrated from Gemini to Anthropic Claude on 2026-05-03 (PR #11): Google
// billing was blocked, Anthropic billing already worked. The Noon-style
// prompt and response shape ({title, description}) are unchanged — only the
// transport switched.
//
// The old src/lib/gemini.ts is left in place for one week as a rollback
// path: switching the imports back is a one-line revert.

import Anthropic from '@anthropic-ai/sdk';

export type ImageInput = { base64: string; mimeType: string };

export type ListingContext = {
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
  condition_notes?: string | null;
  shop?: string | null;
  price?: number | string | null;
};

// Bufaisal uses Claude Haiku 4.5 (claude-haiku-4-5-20251001):
// - Fast, cheap, vision-capable, designed for high-volume pipelines
// - DO NOT downgrade to older models. DO NOT switch to Gemini.
// - For better quality, upgrade to Sonnet 4.6 (claude-sonnet-4-6)
//   not a different version of Haiku.
export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Anthropic image blocks accept these media types.
type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
const CLAUDE_IMAGE_MEDIA_TYPES: readonly ClaudeImageMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

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
- Mention the Ajman shop location and delivery across all UAE emirates.
- End the description with the exact sentence: Click WhatsApp to negotiate.

Voice rules — strictly enforced:
- No marketing words: "amazing", "stunning", "premium", "luxurious", "perfect", "incredible", "must-have", "high-quality".
- No exclamation marks.
- No emojis in the description text.
- Do not mention the price in the description (price renders separately on the card).

Return strict JSON only, no other text, no markdown fences:
{"title": "string", "description": "string"}`;
}

// Calls Claude with a prompt + multiple inline images. Returns the raw text
// response (caller is responsible for JSON parsing). Never throws — billing,
// rate limit, and quota errors come back as { ok: false } so callers can
// preserve the never-throw semantics established in PR #10.
export async function callAIVision(opts: {
  apiKey: string;
  prompt: string;
  images: ImageInput[];
}): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  // Bufaisal uses Claude Haiku 4.5 (claude-haiku-4-5-20251001):
  // - Fast, cheap, vision-capable, designed for high-volume pipelines
  // - DO NOT downgrade to older models. DO NOT switch to Gemini.
  // - For better quality, upgrade to Sonnet 4.6 (claude-sonnet-4-6)
  //   not a different version of Haiku.
  const model = CLAUDE_MODEL;

  const imageBlocks = opts.images.map((img) => {
    const mediaType: ClaudeImageMediaType = (
      CLAUDE_IMAGE_MEDIA_TYPES as readonly string[]
    ).includes(img.mimeType)
      ? (img.mimeType as ClaudeImageMediaType)
      : 'image/jpeg';
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mediaType,
        data: img.base64,
      },
    };
  });

  try {
    const client = new Anthropic({ apiKey: opts.apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: opts.prompt },
          ],
        },
      ],
    });

    const firstText = response.content.find((b) => b.type === 'text');
    const text = firstText && firstText.type === 'text' ? firstText.text : '';
    return { ok: true, text, status: 200 };
  } catch (err) {
    const status =
      err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 502;
    const message =
      err instanceof Error ? err.message : `AI API error (${status})`;
    return { ok: false, text: '', status, error: message };
  }
}

// Pull `{...}` out of an AI response that may have stray prose around it.
// The same defensive parser used since PR #10 — it still applies here, since
// we only changed the transport, not the prompt or the JSON shape.
export function extractJsonObject(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
