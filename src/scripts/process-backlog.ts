/**
 * One-time backlog runner for Phase 4 deploy.
 *
 * Finds every shop_items row in status='processing' older than 1 minute and
 * kicks /api/items/{id}/generate-listing for each. Used to drain the 4 phone-
 * test rows that sat in 'processing' through Phase 3 (the legacy job filtered
 * on 'agent_drafting', so it never picked them up) plus anything else that
 * accumulated before the new processor went live.
 *
 * Run with:
 *   BASE_URL=https://bufaisal.ae \
 *   INTERNAL_API_SECRET=... \
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx src/scripts/process-backlog.ts
 *
 * Safe to re-run — the generate-listing route checks status='processing'
 * before doing any work and returns a no-op for rows already moved to
 * 'pending'. Pass --force as the first argv to also reprocess 'pending'
 * rows (useful for reprocessing flag-only failures from earlier runs).
 */

import { createClient } from '@supabase/supabase-js';

interface BacklogRow {
  id: string;
  status: string | null;
  worker_submitted_at: string | null;
  created_at: string;
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const force = process.argv.includes('--force');

  for (const [name, value] of [
    ['BASE_URL', baseUrl],
    ['INTERNAL_API_SECRET', internalSecret],
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseKey],
  ] as const) {
    if (!value) {
      console.error(`Missing env var: ${name}`);
      process.exit(1);
    }
  }

  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const targetStatus = force ? ['processing', 'pending'] : ['processing'];

  const { data, error } = await supabase
    .from('shop_items')
    .select('id, status, worker_submitted_at, created_at')
    .in('status', targetStatus)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch backlog:', error);
    process.exit(1);
  }

  const rows: BacklogRow[] = (data ?? []) as BacklogRow[];
  console.log(`Found ${rows.length} backlog row(s) (status in ${JSON.stringify(targetStatus)}, older than 1m)`);

  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const url = `${baseUrl}/api/items/${row.id}/generate-listing`;
    process.stdout.write(`  ${row.id} (${row.status}, submitted ${row.worker_submitted_at ?? row.created_at}) … `);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalSecret}`,
        },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        console.log(`ok (${body.result ?? 'success'}, applied=${body.applied}, attempts=${body.attempts ?? '?'})`);
        succeeded++;
      } else {
        console.log(`FAILED ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
