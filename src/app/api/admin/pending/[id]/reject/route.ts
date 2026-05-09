// Phase 5 admin pending dashboard — reject + archive.
//
// Sets status='archived', is_published=false (defensive — pending items
// already have is_published=false from worker submit), writes audit_log.
// Cloudinary photos are NEVER deleted (locked decision 2026-05-07 #6).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import { writeAdminAudit } from '@/lib/admin-pending-publish';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const admin = verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-reject-${ip}`, 30, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = context.params;
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });

  // Optional rejection reason for the audit log.
  let reason: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.reason === 'string') {
      reason = body.reason.trim().slice(0, 500) || null;
    }
  } catch {
    /* empty body is fine */
  }

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
      { error: `Cannot reject: item is in '${existing.status}', not 'pending'` },
      { status: 409 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from('shop_items')
    .update({
      status: 'archived',
      is_published: false,
    })
    .eq('id', id);
  if (updErr) {
    console.error('[admin/pending reject] update failed:', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await writeAdminAudit({
    itemId: id,
    adminName: admin,
    action: 'admin_rejected',
    beforeStatus: 'pending',
    afterStatus: 'archived',
    metadata: reason ? { reason } : undefined,
  });

  return NextResponse.json({ success: true });
}
