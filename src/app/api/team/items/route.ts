import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import { verifyShopSessionToken } from '@/lib/shop-session';

// Phase 3 (Decisions Log v1.1 Addendum, May 7 2026): the worker submit
// payload is now a small fixed shape — 4 photos + Used/New + (Excellent/
// Good/Fair if Used) + Yes/No + price + optional note. AI runs after
// submit; the row lands in status='processing' for the Phase 4 background
// job to pick up. The legacy fields (item_name / brand / category /
// description / barcode / product_type / condition_notes / seo_*) are
// no longer accepted from /team — those will be filled by the AI agent.
//
// shop_items has NOT NULL columns for item_name and category that predate
// schema separation. Until the legacy admin view is rewritten in Phase 5
// we satisfy them with empty strings; the row is is_published=false and
// status='processing', so the public site never sees these placeholders.

interface WorkerSubmitItem {
  worker_id?: unknown;
  worker_shop_id?: unknown;
  worker_condition_type?: unknown;
  worker_condition_grade?: unknown;
  worker_negotiable?: unknown;
  worker_price_aed?: unknown;
  worker_note?: unknown;
  worker_photo_brand_url?: unknown;
  worker_photo_2_url?: unknown;
  worker_photo_3_url?: unknown;
  worker_photo_barcode_url?: unknown;
}

const VALID_GRADES = new Set(['Excellent', 'Good', 'Fair']);

function isHttpsUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length < 2048 &&
    value.startsWith('https://')
  );
}

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenShop = token ? verifyShopSessionToken(token) : null;
  if (!tokenShop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`team-items-${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { action?: string; item?: WorkerSubmitItem };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (body.action !== 'insert_item' || !body.item) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const item = body.item;

  // --- worker_id (worker name from session, sent by client) ---
  const workerId =
    typeof item.worker_id === 'string' ? item.worker_id.trim() : '';
  if (!workerId) {
    return NextResponse.json(
      { error: 'Missing worker_id' },
      { status: 400 }
    );
  }

  // --- worker_shop_id (BF1–BF5) ---
  const workerShopId =
    typeof item.worker_shop_id === 'string' ? item.worker_shop_id.trim() : '';
  if (!/^BF[1-5]$/.test(workerShopId)) {
    return NextResponse.json(
      { error: 'worker_shop_id must be BF1–BF5' },
      { status: 400 }
    );
  }

  // --- worker_condition_type ---
  const conditionType = item.worker_condition_type;
  if (conditionType !== 'Used' && conditionType !== 'New') {
    return NextResponse.json(
      { error: 'worker_condition_type must be "Used" or "New"' },
      { status: 400 }
    );
  }

  // --- worker_condition_grade — required iff Used ---
  let conditionGrade: string | null = null;
  if (conditionType === 'Used') {
    if (
      typeof item.worker_condition_grade !== 'string' ||
      !VALID_GRADES.has(item.worker_condition_grade)
    ) {
      return NextResponse.json(
        { error: 'worker_condition_grade must be Excellent / Good / Fair when Used' },
        { status: 400 }
      );
    }
    conditionGrade = item.worker_condition_grade;
  }

  // --- worker_negotiable ---
  if (typeof item.worker_negotiable !== 'boolean') {
    return NextResponse.json(
      { error: 'worker_negotiable must be a boolean' },
      { status: 400 }
    );
  }
  const negotiable = item.worker_negotiable;

  // --- worker_price_aed ---
  if (
    typeof item.worker_price_aed !== 'number' ||
    !Number.isInteger(item.worker_price_aed) ||
    item.worker_price_aed < 1
  ) {
    return NextResponse.json(
      { error: 'worker_price_aed must be a positive integer' },
      { status: 400 }
    );
  }
  const priceAed = item.worker_price_aed;

  // --- worker_note (optional, trimmed, length-capped to keep DB writes sane) ---
  let workerNote: string | null = null;
  if (item.worker_note != null) {
    if (typeof item.worker_note !== 'string') {
      return NextResponse.json(
        { error: 'worker_note must be a string' },
        { status: 400 }
      );
    }
    const trimmed = item.worker_note.trim();
    if (trimmed.length > 1000) {
      return NextResponse.json(
        { error: 'worker_note too long (max 1000 chars)' },
        { status: 400 }
      );
    }
    workerNote = trimmed || null;
  }

  // --- 4 photo URLs (Cloudinary HTTPS) ---
  if (
    !isHttpsUrl(item.worker_photo_brand_url) ||
    !isHttpsUrl(item.worker_photo_2_url) ||
    !isHttpsUrl(item.worker_photo_3_url) ||
    !isHttpsUrl(item.worker_photo_barcode_url)
  ) {
    return NextResponse.json(
      { error: 'All 4 photo URLs are required' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const insertRow = {
    // ── Worker schema-separation columns (Phase 1) ────────────
    worker_id: workerId,
    worker_shop_id: workerShopId,
    worker_condition_type: conditionType,
    worker_condition_grade: conditionGrade,
    worker_negotiable: negotiable,
    worker_price_aed: priceAed,
    worker_note: workerNote,
    worker_photo_brand_url: item.worker_photo_brand_url,
    worker_photo_2_url: item.worker_photo_2_url,
    worker_photo_3_url: item.worker_photo_3_url,
    worker_photo_barcode_url: item.worker_photo_barcode_url,
    worker_submitted_at: now,

    // ── Phase 3 state machine ─────────────────────────────────
    // 'processing' = worker submitted, AI hasn't run yet. Phase 4's
    // background processor flips this to 'pending' (success or failure)
    // so admin always sees the item in the queue.
    status: 'processing' as const,

    // ── Legacy column compatibility ───────────────────────────
    // shop_items has NOT NULL constraints on item_name and category that
    // predate schema separation. Empty strings satisfy the constraint.
    // The row is is_published=false until admin approves, so the public
    // site never reads these placeholders.
    item_name: '',
    category: '',
    sale_price: priceAed, // legacy mirror — kept in sync with worker_price_aed
    shop_source: `Shop ${tokenShop}`,
    shop_label: tokenShop,
    duty_manager: workerId,
    // listing_type mirrors worker_condition_type ('used' | 'new') so any
    // legacy code paths (e.g. /admin) reading listing_type keep working
    // until Phase 5 rewrites them.
    listing_type: conditionType.toLowerCase(),
    image_urls: [
      item.worker_photo_brand_url,
      item.worker_photo_2_url,
      item.worker_photo_3_url,
    ],
    thumbnail_url: item.worker_photo_brand_url,
    is_published: false,
    is_sold: false,
    negotiable,
    // /api/team/stats counts items by uploaded_by = workerName. Set this
    // to the worker name (not the shop label as before) so the daily
    // counter actually returns matches.
    uploaded_by: workerId,
    uploaded_at: now,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from('shop_items')
    .insert(insertRow)
    .select('id')
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'Insert failed' },
      { status: 500 }
    );
  }

  // Phase 4 (background AI processor) re-attaches a kickoff here. The
  // legacy /api/jobs/generate-listing job filters strictly on
  // status='agent_drafting' and won't touch 'processing' rows, so for now
  // the row sits in 'processing' until the new processor lands.

  return NextResponse.json({ success: true, id: inserted.id });
}
