// Phase 5 admin pending dashboard — strict-gated one-tap approve.
//
// Re-checks the eligibility rule on the server (the client UI only
// hides the button — a sophisticated user could POST directly):
//   - status='pending'
//   - ai_confidence_score >= 0.8
//   - ai_flags is empty / null
//   - no admin_* override is set
// Any failure → 422 with reason. Eligible → same publish flow as approve.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import { PENDING_ITEM_COLUMNS } from '@/app/admin/pending/types';
import type { PendingItem } from '@/app/admin/pending/types';
import {
  buildPublishUpdate,
  hasAnyAdminOverride,
  writeAdminAudit,
} from '@/lib/admin-pending-publish';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const admin = verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-quick-${ip}`, 30, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = context.params;
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('shop_items')
    .select(PENDING_ITEM_COLUMNS)
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const item = data as unknown as PendingItem;

  // ── Strict server-side gate. The truth lives here, not in the UI. ──
  if (item.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot quick-approve: item is in '${item.status}', not 'pending'` },
      { status: 409 }
    );
  }
  const confidence = item.ai_confidence_score ?? 0;
  if (confidence < 0.8) {
    return NextResponse.json(
      { error: `Quick-approve blocked: confidence ${confidence.toFixed(2)} < 0.8 — open detail editor` },
      { status: 422 }
    );
  }
  if (Array.isArray(item.ai_flags) && item.ai_flags.length > 0) {
    return NextResponse.json(
      { error: `Quick-approve blocked: ${item.ai_flags.length} flag(s) raised — open detail editor` },
      { status: 422 }
    );
  }
  if (hasAnyAdminOverride(item)) {
    return NextResponse.json(
      { error: 'Quick-approve blocked: admin overrides are set — use Approve & Publish in the editor' },
      { status: 422 }
    );
  }

  const { update } = buildPublishUpdate(item, admin);

  const { error: updErr } = await supabaseAdmin
    .from('shop_items')
    .update(update)
    .eq('id', id);
  if (updErr) {
    console.error('[admin/pending quick-approve] update failed:', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await writeAdminAudit({
    itemId: id,
    adminName: admin,
    action: 'admin_approved',
    beforeStatus: 'pending',
    afterStatus: 'published',
    metadata: {
      via: 'quick_approve',
      confidence,
    },
  });

  return NextResponse.json({ success: true });
}
