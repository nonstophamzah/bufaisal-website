// Phase 5 admin pending dashboard — single-item GET + PATCH.
//
// GET  → returns one pending item plus its audit_log history.
// PATCH → applies admin_* edits without flipping status. Sending null for
//         a field clears the override (will revert to ai_* on next publish).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import {
  ADMIN_EDITABLE_FIELDS,
  PENDING_ITEM_COLUMNS,
} from '@/app/admin/pending/types';
import { writeAdminAudit } from '@/lib/admin-pending-publish';

export const dynamic = 'force-dynamic';

const VALID_GRADES = new Set(['Excellent', 'Good', 'Fair']);

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const admin = verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-get-${ip}`, 60, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = context.params;
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });

  const [itemRes, auditRes] = await Promise.all([
    supabaseAdmin
      .from('shop_items')
      .select(PENDING_ITEM_COLUMNS)
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('audit_log')
      .select('id, action, actor_type, actor_id, metadata, created_at')
      .eq('item_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (itemRes.error || !itemRes.data) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Status guard added 2026-05-10 after admin-pending investigation:
  // direct deep links to /admin/pending/<id> would render the editor
  // for archived/published rows, with all the action buttons silently
  // failing 409 because they're status-gated. Refusing the GET up
  // front gives the admin a clear "this item is no longer pending"
  // message instead of a broken-feeling editor screen.
  const itemStatus = (itemRes.data as unknown as { status: string | null }).status;
  if (itemStatus !== 'pending') {
    return NextResponse.json(
      {
        error: `This item is in '${itemStatus}', not 'pending'. The pending editor only handles items awaiting review.`,
        current_status: itemStatus,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    item: itemRes.data,
    audit_log: auditRes.data ?? [],
  });
}

// Validate one editable field. Returns the cleaned value (which may be
// null to clear the override) or throws with a 400-friendly message.
function validateField(field: string, raw: unknown): unknown {
  // Explicit null clears the override — always allowed.
  if (raw === null) return null;

  switch (field) {
    case 'admin_brand':
    case 'admin_item_name':
    case 'admin_product_type':
    case 'admin_category':
    case 'admin_seo_title':
    case 'admin_meta_description':
    case 'admin_description':
    case 'admin_slug':
    case 'admin_geographic_anchor':
      if (typeof raw !== 'string') throw new Error(`${field} must be string or null`);
      if (raw.length > 5000) throw new Error(`${field} too long`);
      return raw.trim() || null;

    case 'admin_condition_grade':
      if (typeof raw !== 'string' || !VALID_GRADES.has(raw)) {
        throw new Error(`${field} must be Excellent / Good / Fair`);
      }
      return raw;

    case 'admin_price_aed':
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
        throw new Error(`${field} must be a positive integer`);
      }
      return raw;

    case 'admin_negotiable':
      if (typeof raw !== 'boolean') throw new Error(`${field} must be boolean`);
      return raw;

    case 'admin_spec_table':
    case 'admin_internal_link_targets':
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${field} must be an object`);
      }
      return raw;

    case 'admin_faqs':
      if (!Array.isArray(raw)) throw new Error(`${field} must be an array`);
      for (const f of raw) {
        if (
          typeof f !== 'object' ||
          f === null ||
          typeof (f as { question?: unknown }).question !== 'string' ||
          typeof (f as { answer?: unknown }).answer !== 'string'
        ) {
          throw new Error(`${field} entries must be {question, answer}`);
        }
      }
      return raw;

    case 'admin_trust_signals':
    case 'admin_image_alt_texts':
      if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string')) {
        throw new Error(`${field} must be an array of strings`);
      }
      return raw;

    default:
      throw new Error(`Unknown field: ${field}`);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const admin = verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-patch-${ip}`, 30, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = context.params;
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const fieldsChanged: string[] = [];
  try {
    for (const field of ADMIN_EDITABLE_FIELDS) {
      if (field in body) {
        update[field] = validateField(field, body[field]);
        fieldsChanged.push(field);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (fieldsChanged.length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  // Confirm the row is in 'pending' before mutating — guards against
  // writing admin overrides onto a row someone else just published or
  // archived from another tab.
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('shop_items')
    .select('status')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot edit: item is in '${existing.status}', not 'pending'` },
      { status: 409 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from('shop_items')
    .update(update)
    .eq('id', id);
  if (updErr) {
    console.error('[admin/pending PATCH] update failed:', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await writeAdminAudit({
    itemId: id,
    adminName: admin,
    action: 'admin_edited',
    beforeStatus: 'pending',
    afterStatus: 'pending',
    metadata: { fields_changed: fieldsChanged },
  });

  return NextResponse.json({ success: true });
}
