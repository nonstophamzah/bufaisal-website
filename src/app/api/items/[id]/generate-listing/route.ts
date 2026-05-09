import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CLAUDE_SONNET_MODEL } from '@/lib/ai';

// Phase 4 (Decisions Log v1.1 Addendum, May 7 2026): the async listing
// generator. Triggered via waitUntil() from /api/team/items immediately after
// worker submit, also re-triggerable manually with INTERNAL_API_SECRET.
//
// Reads worker_* columns + 4 Cloudinary photo URLs, calls Sonnet with the
// locked SEO Agent v1.0 prompt, parses the JSON output, validates structure,
// retries on failure (max 3 attempts), and writes ai_* columns + flips
// status='processing' → 'pending'. Items NEVER stay in 'processing' beyond
// the cleanup cron's 10-minute deadline.
//
// Auth: Bearer token timing-safe compared with INTERNAL_API_SECRET.

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const PROMPT_VERSION = '1.0';
const MAX_ATTEMPTS = 3;

// Module-level cache so we read the prompt from disk at most once per cold
// start. ~30KB file; one fs.readFileSync at boot is far cheaper than reading
// it on every request.
let cachedPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedPrompt === null) {
    cachedPrompt = fs.readFileSync(
      path.join(process.cwd(), 'lib/prompts/listing-generator-v1.md'),
      'utf-8'
    );
  }
  return cachedPrompt;
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authorize(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  return timingSafeEq(header.slice(7), expected);
}

// Phase 3 inserts shop_label as 'A'..'E' from the worker session token.
// The locked prompt's input contract wants shop_name = "Shop X" and
// shop_location = "Ajman" — derive both from shop_label.
function shopLabelToName(label: string | null | undefined): string {
  return label && /^[A-E]$/.test(label) ? `Shop ${label}` : 'Shop';
}

// Sonnet sometimes wraps JSON in ```json ... ``` despite the prompt's
// "no markdown fences" instruction. Strip them defensively.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

interface AiOutput {
  barcode: {
    barcode_string: string | null;
    barcode_label_raw?: string | null;
    label_item_type?: string | null;
    label_other_text?: string | null;
  };
  extracted: {
    brand: string;
    item_name: string;
    product_type: string;
    category: string;
    visible_specs?: unknown;
    visible_condition_signals?: string;
    agrees_with_label?: boolean;
  };
  listing: {
    seo_title: string;
    h1_title: string;
    meta_description: string;
    slug: string;
    description: string;
    spec_table: Record<string, unknown>;
    faqs: Array<{ question: string; answer: string }>;
    image_alt_texts: string[];
    geographic_anchor: string;
    trust_signals: string[];
    internal_link_targets: {
      same_brand: string;
      same_category: string;
      same_shop: string;
    };
  };
  schemas: {
    product_schema: unknown;
    faq_schema: unknown;
  };
  agent_metadata: {
    version: string;
    generated_at: string;
    model: string;
    confidence_score: number;
    flags: string[];
  };
}

type ValidationResult =
  | { ok: true; out: AiOutput }
  | { ok: false; errors: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateAiOutput(parsed: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(parsed)) return { ok: false, errors: ['root: not an object'] };

  const root = parsed as Record<string, unknown>;
  for (const key of ['barcode', 'extracted', 'listing', 'schemas', 'agent_metadata']) {
    if (!isObject(root[key])) errors.push(`${key}: missing or not an object`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const ext = root.extracted as Record<string, unknown>;
  for (const k of ['brand', 'item_name', 'product_type', 'category']) {
    if (typeof ext[k] !== 'string') errors.push(`extracted.${k}: not a string`);
  }

  const lst = root.listing as Record<string, unknown>;
  for (const k of ['seo_title', 'h1_title', 'meta_description', 'slug', 'description', 'geographic_anchor']) {
    if (typeof lst[k] !== 'string') errors.push(`listing.${k}: not a string`);
  }
  if (!isObject(lst.spec_table)) errors.push('listing.spec_table: not an object');
  if (!Array.isArray(lst.faqs) || lst.faqs.length !== 4) {
    errors.push('listing.faqs: must be an array of exactly 4 entries');
  } else {
    for (let i = 0; i < lst.faqs.length; i++) {
      const f = lst.faqs[i];
      if (!isObject(f) || typeof f.question !== 'string' || typeof f.answer !== 'string') {
        errors.push(`listing.faqs[${i}]: missing question or answer string`);
      }
    }
  }
  if (!Array.isArray(lst.image_alt_texts) || lst.image_alt_texts.length !== 4) {
    errors.push('listing.image_alt_texts: must be an array of exactly 4 strings');
  }
  if (!Array.isArray(lst.trust_signals) || lst.trust_signals.length === 0) {
    errors.push('listing.trust_signals: must be a non-empty array');
  }
  if (!isObject(lst.internal_link_targets)) {
    errors.push('listing.internal_link_targets: not an object');
  }

  const schemas = root.schemas as Record<string, unknown>;
  if (!isObject(schemas.product_schema)) errors.push('schemas.product_schema: not an object');
  if (!isObject(schemas.faq_schema)) errors.push('schemas.faq_schema: not an object');

  const meta = root.agent_metadata as Record<string, unknown>;
  if (typeof meta.confidence_score !== 'number' || (meta.confidence_score as number) < 0 || (meta.confidence_score as number) > 1) {
    errors.push('agent_metadata.confidence_score: must be a number between 0 and 1');
  }
  if (!Array.isArray(meta.flags)) errors.push('agent_metadata.flags: must be an array');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, out: parsed as unknown as AiOutput };
}

// Build the user message text per spec §4E. The prompt parses readable
// structured text more accurately than raw JSON.stringify of an object.
function buildUserMessageText(args: {
  itemId: string;
  conditionType: string;
  conditionGrade: string | null;
  negotiable: boolean;
  priceAed: number;
  note: string | null;
  shopId: string;
  shopName: string;
  shopLocation: string;
}): string {
  return `INPUT FOR THIS ITEM:

Worker Input:
- condition_type: ${args.conditionType}
- condition_grade: ${args.conditionGrade ?? 'N/A (item is New)'}
- negotiable: ${args.negotiable}
- price_aed: ${args.priceAed}
- note: ${args.note ?? '(none)'}
- shop_id: ${args.shopId}

Shop Metadata:
- shop_name: ${args.shopName}
- shop_location: ${args.shopLocation}

Item ID (for your reference): ${args.itemId}

The 4 photos for this item are attached to this message in this order:
1. Brand photo
2. Photo 2 (item view)
3. Photo 3 (item angle/detail)
4. Barcode label photo

Generate the listing per your system instructions. Return only the JSON object.`;
}

interface CallResult {
  kind: 'success';
  out: AiOutput;
  rawText: string;
  validationErrors?: never;
}
interface CallParseFail {
  kind: 'parse_failed';
  rawText: string;
}
interface CallValidationFail {
  kind: 'validation_failed';
  rawText: string;
  validationErrors: string[];
  parsed?: unknown;
}
interface CallApiFail {
  kind: 'api_failed';
  status: number;
  message: string;
  isAuth: boolean;
  isTimeout: boolean;
}
type AttemptResult = CallResult | CallParseFail | CallValidationFail | CallApiFail;

async function callSonnetOnce(args: {
  client: Anthropic;
  systemPrompt: string;
  userText: string;
  photos: { brand: string; photo_2: string; photo_3: string; barcode: string };
}): Promise<AttemptResult> {
  try {
    const response = await args.client.messages.create({
      model: CLAUDE_SONNET_MODEL,
      max_tokens: 4096,
      system: args.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: args.photos.brand } },
            { type: 'image', source: { type: 'url', url: args.photos.photo_2 } },
            { type: 'image', source: { type: 'url', url: args.photos.photo_3 } },
            { type: 'image', source: { type: 'url', url: args.photos.barcode } },
            { type: 'text', text: args.userText },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { kind: 'parse_failed', rawText: '' };
    }

    const cleaned = stripFences(textBlock.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { kind: 'parse_failed', rawText: cleaned };
    }

    const validation = validateAiOutput(parsed);
    if (!validation.ok) {
      return {
        kind: 'validation_failed',
        rawText: cleaned,
        validationErrors: validation.errors,
        parsed,
      };
    }
    return { kind: 'success', out: validation.out, rawText: cleaned };
  } catch (err) {
    const status =
      err instanceof Anthropic.APIError && typeof err.status === 'number' ? err.status : 0;
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    const isAuth = status === 401 || status === 403;
    // Anthropic SDK throws APIConnectionTimeoutError for connection-level
    // timeouts. 408 / 504 from upstream count as timeouts too.
    const isTimeout =
      err instanceof Anthropic.APIConnectionTimeoutError ||
      status === 408 ||
      status === 504;
    return { kind: 'api_failed', status, message, isAuth, isTimeout };
  }
}

function backoffMs(attemptIndex: number): number {
  // Attempt 0 → no delay (already waited via outer loop).
  // Attempt 1 → 1s, attempt 2 → 3s.
  return [0, 1000, 3000][attemptIndex] ?? 5000;
}

interface BuildUpdateResult {
  update: Record<string, unknown>;
  flagsApplied: string[];
}

function buildBestEffortUpdate(
  parsed: unknown,
  extraFlags: string[]
): BuildUpdateResult {
  // Used when validation fails 3x — write whatever fields we can recognize.
  const update: Record<string, unknown> = {};
  const flags = [...extraFlags];

  if (isObject(parsed)) {
    const root = parsed as Record<string, unknown>;
    if (isObject(root.barcode)) {
      const b = root.barcode as Record<string, unknown>;
      if (typeof b.barcode_string === 'string' || b.barcode_string === null) {
        update.ai_barcode_extracted = b.barcode_string ?? null;
      }
      if (typeof b.label_item_type === 'string' || b.label_item_type === null) {
        update.ai_label_item_type = b.label_item_type ?? null;
      }
    }
    if (isObject(root.extracted)) {
      const e = root.extracted as Record<string, unknown>;
      if (typeof e.brand === 'string') update.ai_brand = e.brand;
      if (typeof e.item_name === 'string') update.ai_item_name = e.item_name;
      if (typeof e.product_type === 'string') update.ai_product_type = e.product_type;
      if (typeof e.category === 'string') update.ai_category = e.category;
    }
    if (isObject(root.listing)) {
      const l = root.listing as Record<string, unknown>;
      if (typeof l.seo_title === 'string') update.ai_seo_title = l.seo_title;
      if (typeof l.h1_title === 'string') update.ai_h1_title = l.h1_title;
      if (typeof l.meta_description === 'string') update.ai_meta_description = l.meta_description;
      if (typeof l.slug === 'string') update.ai_slug = l.slug;
      if (typeof l.description === 'string') update.ai_description = l.description;
      if (typeof l.geographic_anchor === 'string') update.ai_geographic_anchor = l.geographic_anchor;
      if (isObject(l.spec_table)) update.ai_spec_table = l.spec_table;
      if (Array.isArray(l.faqs)) update.ai_faqs = l.faqs;
      if (Array.isArray(l.image_alt_texts)) update.ai_image_alt_texts = l.image_alt_texts;
      if (Array.isArray(l.trust_signals)) update.ai_trust_signals = l.trust_signals;
      if (isObject(l.internal_link_targets)) update.ai_internal_link_targets = l.internal_link_targets;
    }
    if (isObject(root.schemas)) {
      const s = root.schemas as Record<string, unknown>;
      if (isObject(s.product_schema)) update.ai_product_schema = s.product_schema;
      if (isObject(s.faq_schema)) update.ai_faq_schema = s.faq_schema;
    }
    if (isObject(root.agent_metadata)) {
      const m = root.agent_metadata as Record<string, unknown>;
      if (typeof m.confidence_score === 'number') {
        const c = m.confidence_score as number;
        if (c >= 0 && c <= 1) update.ai_confidence_score = c;
      }
      if (Array.isArray(m.flags)) {
        for (const f of m.flags) {
          if (typeof f === 'string' && !flags.includes(f)) flags.push(f);
        }
      }
    }
  }
  return { update, flagsApplied: flags };
}

function buildSuccessUpdate(out: AiOutput, mergedFlags: string[]): Record<string, unknown> {
  return {
    ai_barcode_extracted: out.barcode.barcode_string ?? null,
    ai_label_item_type: out.barcode.label_item_type ?? null,
    ai_brand: out.extracted.brand,
    ai_item_name: out.extracted.item_name,
    ai_product_type: out.extracted.product_type,
    ai_category: out.extracted.category,
    ai_seo_title: out.listing.seo_title,
    ai_h1_title: out.listing.h1_title,
    ai_meta_description: out.listing.meta_description,
    ai_slug: out.listing.slug,
    ai_description: out.listing.description,
    ai_spec_table: out.listing.spec_table,
    ai_faqs: out.listing.faqs,
    ai_image_alt_texts: out.listing.image_alt_texts,
    ai_geographic_anchor: out.listing.geographic_anchor,
    ai_trust_signals: out.listing.trust_signals,
    ai_internal_link_targets: out.listing.internal_link_targets,
    ai_product_schema: out.schemas.product_schema,
    ai_faq_schema: out.schemas.faq_schema,
    ai_confidence_score: out.agent_metadata.confidence_score,
    ai_flags: mergedFlags,
  };
}

async function writeAuditLog(args: {
  itemId: string;
  action: string;
  metadata: Record<string, unknown>;
  beforeStatus?: string;
  afterStatus?: string;
}): Promise<void> {
  const before = args.beforeStatus ? { status: args.beforeStatus } : null;
  const after = args.afterStatus ? { status: args.afterStatus } : null;
  const { error } = await supabaseAdmin.from('audit_log').insert({
    item_id: args.itemId,
    action: args.action,
    actor_type: 'ai',
    actor_id: `ai-v${PROMPT_VERSION}`,
    before_state: before,
    after_state: after,
    metadata: args.metadata,
  });
  if (error) {
    console.error(`[generate-listing] audit_log insert failed for ${args.itemId}:`, error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const startedAt = Date.now();
  const itemId = context.params.id;

  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 }
    );
  }

  // Allow admin re-runs even on items already in 'pending' via { force: true }.
  let force = false;
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && body.force === true) force = true;
  } catch {
    // Empty body is fine — waitUntil() and curl both call us without one.
  }

  // shop_items has dozens of columns from multiple migration phases —
  // supabase-js's inference falls back to GenericStringError for long select
  // strings. Cast to a precise local shape after the fetch.
  interface FetchedItem {
    id: string;
    status: string | null;
    shop_label: string | null;
    worker_condition_type: string | null;
    worker_condition_grade: string | null;
    worker_negotiable: boolean | null;
    worker_price_aed: number | null;
    worker_note: string | null;
    worker_shop_id: string | null;
    worker_photo_brand_url: string | null;
    worker_photo_2_url: string | null;
    worker_photo_3_url: string | null;
    worker_photo_barcode_url: string | null;
    ai_flags: string[] | null;
  }
  const { data: rawItem, error: fetchErr } = await supabaseAdmin
    .from('shop_items')
    .select(
      'id, status, shop_label, worker_condition_type, worker_condition_grade, ' +
        'worker_negotiable, worker_price_aed, worker_note, worker_shop_id, ' +
        'worker_photo_brand_url, worker_photo_2_url, worker_photo_3_url, ' +
        'worker_photo_barcode_url, ai_flags'
    )
    .eq('id', itemId)
    .single();

  if (fetchErr || !rawItem) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  const item = rawItem as unknown as FetchedItem;

  if (item.status !== 'processing' && !force) {
    return NextResponse.json(
      { ok: true, applied: false, reason: 'not_processing', current_status: item.status },
      { status: 200 }
    );
  }

  const photos = {
    brand: item.worker_photo_brand_url,
    photo_2: item.worker_photo_2_url,
    photo_3: item.worker_photo_3_url,
    barcode: item.worker_photo_barcode_url,
  };
  if (!photos.brand || !photos.photo_2 || !photos.photo_3 || !photos.barcode) {
    const flags = ['photo_missing'];
    await supabaseAdmin
      .from('shop_items')
      .update({
        status: 'pending',
        ai_flags: flags,
        ai_generated_at: new Date().toISOString(),
        ai_prompt_version: PROMPT_VERSION,
        ai_model_used: CLAUDE_SONNET_MODEL,
      })
      .eq('id', itemId);
    await writeAuditLog({
      itemId,
      action: 'ai_completed',
      metadata: { flags, reason: 'photo_missing', duration_ms: Date.now() - startedAt },
      beforeStatus: 'processing',
      afterStatus: 'pending',
    });
    return NextResponse.json({ ok: true, applied: true, flags });
  }

  console.log(
    `[generate-listing] AI generation started for item ${itemId} model=${CLAUDE_SONNET_MODEL}`
  );

  const userText = buildUserMessageText({
    itemId,
    conditionType: item.worker_condition_type ?? 'Used',
    conditionGrade: item.worker_condition_grade,
    negotiable: Boolean(item.worker_negotiable),
    priceAed: item.worker_price_aed ?? 0,
    note: item.worker_note,
    shopId: item.worker_shop_id ?? '',
    shopName: shopLabelToName(item.shop_label),
    shopLocation: 'Ajman',
  });

  const systemPrompt = getSystemPrompt();
  const client = new Anthropic({ apiKey });

  let lastResult: AttemptResult | null = null;
  let timeoutCount = 0;
  let parseCount = 0;
  let validationCount = 0;
  let attempts = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    const delay = backoffMs(i);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    const result = await callSonnetOnce({
      client,
      systemPrompt,
      userText,
      photos: {
        brand: photos.brand,
        photo_2: photos.photo_2,
        photo_3: photos.photo_3,
        barcode: photos.barcode,
      },
    });
    lastResult = result;

    if (result.kind === 'success') break;
    if (result.kind === 'api_failed') {
      // Fail fast on auth — no point retrying with a bad key.
      if (result.isAuth) break;
      if (result.isTimeout) timeoutCount++;
    } else if (result.kind === 'parse_failed') {
      parseCount++;
    } else if (result.kind === 'validation_failed') {
      validationCount++;
      console.warn(
        `[generate-listing] validation failed for ${itemId} (attempt ${attempts}): ${result.validationErrors.join('; ')}`
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  const generatedAt = new Date().toISOString();

  // Compose final update. ai_flags includes any ai_*-prefixed failure flag
  // appropriate to the failure mode, so the admin pending UI can route the
  // item correctly. status ALWAYS flips to 'pending' (per spec: items never
  // stay in 'processing').
  let update: Record<string, unknown> = {
    status: 'pending',
    ai_generated_at: generatedAt,
    ai_prompt_version: PROMPT_VERSION,
    ai_model_used: CLAUDE_SONNET_MODEL,
  };
  let finalFlags: string[] = [];
  let resultLabel: string;

  if (lastResult?.kind === 'success') {
    finalFlags = [...lastResult.out.agent_metadata.flags];
    update = { ...update, ...buildSuccessUpdate(lastResult.out, finalFlags) };
    resultLabel = 'success';
  } else if (lastResult?.kind === 'validation_failed') {
    const { update: u, flagsApplied } = buildBestEffortUpdate(
      lastResult.parsed,
      ['ai_validation_failed']
    );
    finalFlags = flagsApplied;
    update = { ...update, ...u, ai_flags: finalFlags };
    resultLabel = 'validation_failed';
  } else if (lastResult?.kind === 'parse_failed') {
    finalFlags = ['ai_json_invalid'];
    update.ai_flags = finalFlags;
    resultLabel = 'json_invalid';
  } else if (lastResult?.kind === 'api_failed') {
    if (lastResult.isAuth) {
      finalFlags = ['ai_auth_error'];
      resultLabel = 'auth_error';
    } else if (lastResult.isTimeout) {
      finalFlags = ['ai_api_timeout'];
      resultLabel = 'api_timeout';
    } else {
      finalFlags = ['ai_api_error'];
      resultLabel = 'api_error';
    }
    update.ai_flags = finalFlags;
  } else {
    finalFlags = ['ai_unknown_failure'];
    update.ai_flags = finalFlags;
    resultLabel = 'unknown_failure';
  }

  const { error: updateErr } = await supabaseAdmin
    .from('shop_items')
    .update(update)
    .eq('id', itemId);
  if (updateErr) {
    console.error(`[generate-listing] update failed for ${itemId}:`, updateErr);
  }

  const auditMetadata: Record<string, unknown> = {
    flags: finalFlags,
    duration_ms: durationMs,
    attempts,
    timeout_count: timeoutCount,
    parse_count: parseCount,
    validation_count: validationCount,
    result: resultLabel,
  };
  if (lastResult?.kind === 'api_failed') {
    auditMetadata.error = lastResult.message;
    auditMetadata.api_status = lastResult.status;
  } else if (lastResult?.kind === 'success') {
    auditMetadata.confidence = lastResult.out.agent_metadata.confidence_score;
  }
  await writeAuditLog({
    itemId,
    action: 'ai_completed',
    metadata: auditMetadata,
    beforeStatus: 'processing',
    afterStatus: 'pending',
  });

  if (lastResult?.kind === 'success') {
    console.log(
      `[generate-listing] AI generation completed for item ${itemId} in ${durationMs}ms confidence=${lastResult.out.agent_metadata.confidence_score} flags=${JSON.stringify(finalFlags)}`
    );
  } else {
    console.error(
      `[generate-listing] AI generation failed for item ${itemId} after ${attempts} attempts: ${resultLabel}`
    );
  }

  return NextResponse.json({
    ok: true,
    applied: lastResult?.kind === 'success',
    result: resultLabel,
    flags: finalFlags,
    duration_ms: durationMs,
    attempts,
  });
}
