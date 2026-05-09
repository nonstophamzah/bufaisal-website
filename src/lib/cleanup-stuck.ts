import { supabaseAdmin } from '@/lib/supabase-admin';

// Rescue items stuck in status='processing' beyond a deadline. Used by both
// the daily Vercel cron and as a waitUntil() side effect on every worker
// submit (Hobby tier doesn't allow sub-daily crons, so submit-piggybacked
// cleanup gives us the 10-minute-SLA in practice during business hours).
//
// Each rescued item gets its status flipped processing → pending and the
// flag 'ai_stuck_in_processing' appended to ai_flags. Inserts an audit_log
// row per rescue so we have permanent history. Safe to run concurrently:
// the UPDATE is gated on .eq('status', 'processing') to prevent races
// double-flipping the same row.

export const STUCK_AGE_MINUTES = 10;

interface StuckRow {
  id: string;
  ai_flags: string[] | null;
  worker_submitted_at: string | null;
  created_at: string;
}

export interface CleanupResult {
  cleaned: number;
  ids: string[];
}

export async function rescueStuckItems(
  ageMinutes: number = STUCK_AGE_MINUTES
): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - ageMinutes * 60_000).toISOString();

  // worker_submitted_at is set on every Phase 3 row; created_at is the safe
  // fallback for any pre-Phase-3 row that somehow lacks it.
  const { data, error } = await supabaseAdmin
    .from('shop_items')
    .select('id, ai_flags, worker_submitted_at, created_at')
    .eq('status', 'processing')
    .or(`worker_submitted_at.lt.${cutoff},and(worker_submitted_at.is.null,created_at.lt.${cutoff})`);

  if (error) {
    console.error('[cleanup-stuck] select failed:', error);
    return { cleaned: 0, ids: [] };
  }

  const stuck = (data ?? []) as unknown as StuckRow[];
  if (stuck.length === 0) return { cleaned: 0, ids: [] };

  const cleanedIds: string[] = [];
  for (const row of stuck) {
    const existingFlags = Array.isArray(row.ai_flags) ? row.ai_flags : [];
    const newFlags = existingFlags.includes('ai_stuck_in_processing')
      ? existingFlags
      : [...existingFlags, 'ai_stuck_in_processing'];

    const { error: updateErr } = await supabaseAdmin
      .from('shop_items')
      .update({ status: 'pending', ai_flags: newFlags })
      .eq('id', row.id)
      .eq('status', 'processing');
    if (updateErr) {
      console.error(`[cleanup-stuck] update failed for ${row.id}:`, updateErr);
      continue;
    }

    cleanedIds.push(row.id);
    await supabaseAdmin.from('audit_log').insert({
      item_id: row.id,
      action: 'cleanup_stuck_processing',
      actor_type: 'system',
      actor_id: 'cleanup-stuck',
      before_state: { status: 'processing' },
      after_state: { status: 'pending' },
      metadata: { stuck_minutes_threshold: ageMinutes, flag: 'ai_stuck_in_processing' },
    });
  }

  if (cleanedIds.length > 0) {
    console.log(`[cleanup-stuck] flipped ${cleanedIds.length} stuck items to pending`);
  }
  return { cleaned: cleanedIds.length, ids: cleanedIds };
}
