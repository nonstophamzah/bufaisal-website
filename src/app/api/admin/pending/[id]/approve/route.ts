// Phase 5 admin pending dashboard — full approve & publish.
//
// Computes published_* columns from admin_* (override) ?? ai_* (default),
// mirrors them into the legacy columns the public site reads, flips
// status='pending' → 'published' and is_published=true, writes audit_log.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import { PENDING_ITEM_COLUMNS } from '@/app/admin/pending/types';
import type { PendingItem } from '@/app/admin/pending/types';
import {
  buildPublishUpdate,
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
  const { allowed } = rateLimit(`admin-pending-approve-${ip}`, 30, 60_000);
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
  if (item.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot approve: item is in '${item.status}', not 'pending'` },
      { status: 409 }
    );
  }

  const { update, overridesApplied } = buildPublishUpdate(item, admin);

  const { error: updErr } = await supabaseAdmin
    .from('shop_items')
    .update(update)
    .eq('id', id);
  if (updErr) {
    console.error('[admin/pending approve] update failed:', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await writeAdminAudit({
    itemId: id,
    adminName: admin,
    action: 'admin_approved',
    beforeStatus: 'pending',
    afterStatus: 'published',
    metadata: {
      via: 'detail_editor',
      overrides_applied: overridesApplied,
      override_count: overridesApplied.length,
    },
  });

  return NextResponse.json({ success: true });
}
