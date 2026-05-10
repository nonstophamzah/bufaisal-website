// Phase 5 admin pending dashboard — list endpoint.
//
// Returns every shop_items row with status='pending' (strict equality —
// status IS NULL legacy items are intentionally invisible here, the
// legacy /admin tab still owns them). Sorted newest-submitted first.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import { PENDING_ITEM_COLUMNS } from '@/app/admin/pending/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-list-${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { data, error } = await supabaseAdmin
    .from('shop_items')
    .select(PENDING_ITEM_COLUMNS)
    .eq('status', 'pending')
    .order('worker_submitted_at', { ascending: false });

  if (error) {
    console.error('[admin/pending] list query failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];

  // ─────────────────────────────────────────────────────────────────
  // TEMP DIAGNOSTIC — REMOVE BEFORE LANDING ANY OTHER PR
  // ─────────────────────────────────────────────────────────────────
  // 2026-05-10 bug: production /admin/pending UI is reporting the
  // archived TV stand row showing where the 4 pending rows should be.
  // Service-role replication of this exact query returns the 4 pending
  // rows correctly; can't reproduce. Logging the actual response payload
  // into audit_log so we can see what each real session receives via
  // service-role read. Diagnostic-only — no behavior change.
  //
  // To clean up after diagnosis: delete this whole block AND
  //   DELETE FROM audit_log WHERE action = 'debug_pending_list_call';
  try {
    interface ItemRow {
      id?: unknown;
      status?: unknown;
      is_published?: unknown;
      is_sold?: unknown;
      is_hidden?: unknown;
      worker_id?: unknown;
      ai_item_name?: unknown;
      worker_submitted_at?: unknown;
      updated_at?: unknown;
    }

    // v2 — point-query the TV stand by id (no status filter) to compare
    // against the list query result. If the point-query returns
    // status='archived' but the list returned status='pending' for the
    // same id, we have proof of read inconsistency on the same client
    // for the same row.
    const { data: tvStandPoint, error: tvErr } = await supabaseAdmin
      .from('shop_items')
      .select('id, status, updated_at, is_published, is_sold, is_hidden')
      .eq('id', 'd230899f-8919-4b0f-88be-49b21eca7203')
      .single();

    // v2 — also do a fresh client query (separate Supabase client
    // instance) to rule out module-singleton staleness.
    const { createClient: createFreshClient } = await import('@supabase/supabase-js');
    const freshClient = createFreshClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: freshList } = await freshClient
      .from('shop_items')
      .select('id, status, worker_id, ai_item_name, updated_at, worker_submitted_at')
      .eq('status', 'pending')
      .order('worker_submitted_at', { ascending: false });
    const { data: freshTvStand } = await freshClient
      .from('shop_items')
      .select('id, status, updated_at')
      .eq('id', 'd230899f-8919-4b0f-88be-49b21eca7203')
      .single();

    await supabaseAdmin.from('audit_log').insert({
      item_id: null,
      action: 'debug_pending_list_call_v2',
      actor_type: 'admin',
      actor_id: admin,
      metadata: {
        deployment_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
        deployment_url: process.env.VERCEL_URL ?? 'unknown',
        env_check: {
          // What URL is the production server actually hitting?
          supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING',
          service_key_len: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
          service_key_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 12) ?? 'MISSING',
        },
        request: {
          host: request.headers.get('host'),
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
        },
        // What the SHARED supabaseAdmin singleton returned via the route's
        // exact .eq('status', 'pending') query
        list_response_via_singleton: {
          count: items.length,
          rows: (items as ItemRow[]).map((r) => ({
            id: r.id ?? null,
            status: r.status ?? null,
            updated_at: r.updated_at ?? null,
            worker_id: r.worker_id ?? null,
            ai_item_name: r.ai_item_name ?? null,
          })),
        },
        // What a POINT QUERY for the TV stand id returns (no status filter)
        // via the shared singleton — should show 'archived' if data is
        // current, 'pending' if stale.
        tv_stand_point_via_singleton: {
          err: tvErr?.message ?? null,
          row: tvStandPoint ?? null,
        },
        // What a FRESH supabase client (no module-level reuse) returns
        // for the same list query. If this differs from the singleton,
        // we have proof of singleton-cache staleness.
        list_response_via_fresh_client: {
          count: freshList?.length ?? 0,
          rows: (freshList ?? []).map((r) => ({
            id: r.id,
            status: r.status,
            worker_id: r.worker_id,
            ai_item_name: r.ai_item_name,
          })),
        },
        tv_stand_point_via_fresh_client: freshTvStand ?? null,
      },
    });
  } catch (logErr) {
    // Diagnostic write must NEVER break the actual response. Swallow.
    console.error('[admin/pending] diagnostic insert failed:', logErr);
  }
  // ─── END TEMP DIAGNOSTIC ────────────────────────────────────────

  return NextResponse.json({ items, count: items.length });
}
