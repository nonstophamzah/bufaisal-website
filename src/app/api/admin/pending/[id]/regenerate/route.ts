// Phase 5 admin pending dashboard — re-trigger AI generation.
//
// Sets status='pending' → 'processing' so the UI knows the item is mid-run,
// then invokes the existing Phase 4 endpoint with { force: true } using
// the server-side INTERNAL_API_SECRET. The Phase 4 endpoint replaces the
// ai_* columns and flips status back to 'pending' on completion.
//
// admin_* override columns are intentionally untouched — admin's manual
// edits survive a regenerate so they can compare the new AI output to
// what they had typed.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
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
  // Tighter rate limit than other admin actions — each call costs an
  // Anthropic Sonnet API hit (~$0.05) and runs for 30+ seconds.
  const { allowed } = rateLimit(`admin-pending-regen-${ip}`, 10, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = context.params;
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!baseUrl || !internalSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured: missing NEXT_PUBLIC_BASE_URL or INTERNAL_API_SECRET' },
      { status: 500 }
    );
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('shop_items')
    .select('status')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  // Only allow regenerate from 'pending' — items mid-processing should
  // wait for the current run to finish (Phase 4's cleanup cron handles
  // anything stuck >10 min).
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot regenerate: item is in '${existing.status}', not 'pending'` },
      { status: 409 }
    );
  }

  // Flip to 'processing' first so the list view shows the item as busy
  // even while the Phase 4 call is still in flight.
  const { error: flipErr } = await supabaseAdmin
    .from('shop_items')
    .update({ status: 'processing' })
    .eq('id', id);
  if (flipErr) {
    console.error('[admin/pending regenerate] status flip failed:', flipErr);
    return NextResponse.json({ error: flipErr.message }, { status: 500 });
  }

  await writeAdminAudit({
    itemId: id,
    adminName: admin,
    action: 'admin_regenerate_triggered',
    beforeStatus: 'pending',
    afterStatus: 'processing',
  });

  // Fire the Phase 4 endpoint via waitUntil so the admin gets a fast
  // response. Phase 4 takes ~30-60s; making the admin wait inline would
  // hang the UI. The endpoint flips status back to 'pending' (success or
  // failure) so the dashboard naturally reflects completion on next refresh.
  waitUntil(
    fetch(`${baseUrl}/api/items/${id}/generate-listing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({ force: true }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.error(
            `[admin/pending regenerate] generate-listing non-OK for ${id}: ${res.status} ${txt.slice(0, 200)}`
          );
        }
      })
      .catch((err) => {
        console.error(
          `[admin/pending regenerate] generate-listing fetch failed for ${id}:`,
          err
        );
      })
  );

  return NextResponse.json({ success: true });
}
