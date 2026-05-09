import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Phase 4 cleanup cron. Runs every 5 minutes (see vercel.json) to flip any
// item that's been stuck in status='processing' for >10 minutes to 'pending'
// with the 'ai_stuck_in_processing' flag. Catches AI runs that died silently
// — Vercel functions terminate hard on response, so a waitUntil() that
// crashes mid-flight leaves the row orphaned. This safety net guarantees
// the spec rule: "Items NEVER stay in 'processing' beyond 10 minutes."
//
// Auth: accepts Bearer matching CRON_SECRET (Vercel auto-injects this on
// scheduled cron triggers when CRON_SECRET is set in env vars) OR
// INTERNAL_API_SECRET (for manual ops triggers from scripts/curl).

export const dynamic = 'force-dynamic';

const STUCK_AGE_MINUTES = 10;

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authorize(request: NextRequest): boolean {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (cronSecret && timingSafeEq(token, cronSecret)) return true;
  if (internalSecret && timingSafeEq(token, internalSecret)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STUCK_AGE_MINUTES * 60_000).toISOString();

  // Find stuck rows. We rely on worker_submitted_at (Phase 3 sets this on
  // every new submission), with created_at as a fallback for any row that
  // somehow lacks it.
  const { data: stuck, error: selectErr } = await supabaseAdmin
    .from('shop_items')
    .select('id, ai_flags, worker_submitted_at, created_at')
    .eq('status', 'processing')
    .or(`worker_submitted_at.lt.${cutoff},and(worker_submitted_at.is.null,created_at.lt.${cutoff})`);

  if (selectErr) {
    console.error('[cron/cleanup-stuck-processing] select failed:', selectErr);
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  const ids: string[] = (stuck ?? []).map((r) => r.id as string);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0, items: [] });
  }

  let cleaned = 0;
  for (const row of stuck ?? []) {
    const id = row.id as string;
    const existingFlags = Array.isArray(row.ai_flags) ? (row.ai_flags as string[]) : [];
    const newFlags = existingFlags.includes('ai_stuck_in_processing')
      ? existingFlags
      : [...existingFlags, 'ai_stuck_in_processing'];

    const { error: updateErr } = await supabaseAdmin
      .from('shop_items')
      .update({ status: 'pending', ai_flags: newFlags })
      .eq('id', id)
      .eq('status', 'processing');
    if (updateErr) {
      console.error(`[cron/cleanup-stuck-processing] update failed for ${id}:`, updateErr);
      continue;
    }

    cleaned++;
    await supabaseAdmin.from('audit_log').insert({
      item_id: id,
      action: 'cleanup_stuck_processing',
      actor_type: 'system',
      actor_id: 'cron-cleanup-stuck',
      before_state: { status: 'processing' },
      after_state: { status: 'pending' },
      metadata: { stuck_minutes_threshold: STUCK_AGE_MINUTES, flag: 'ai_stuck_in_processing' },
    });
  }

  console.log(`[cron/cleanup-stuck-processing] flipped ${cleaned} stuck items to pending`);
  return NextResponse.json({ ok: true, cleaned, items: ids });
}
