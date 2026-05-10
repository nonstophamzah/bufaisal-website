// Phase 5 admin pending dashboard — list endpoint.
//
// Returns every shop_items row with status='pending' (strict equality —
// status IS NULL legacy items are intentionally invisible here, the
// legacy /admin tab still owns them). Sorted newest-submitted first.
//
// Cache defeat layers (2026-05-10 — third attempt):
//   1. dynamic='force-dynamic' — Next route segment marker
//   2. revalidate=0 — no ISR
//   3. fetchCache='force-no-store' — every fetch() inside this route
//      runs with cache:'no-store' (supabase-js uses fetch under the hood;
//      without this, Next's data cache may serve stale PostgREST responses
//      even when the route appears dynamic — the bug we hit on PR #33)
//   4. unstable_noStore() at the top of the handler — runtime opt-out
//      of all data caching for this request
//   5. Fresh supabase client per-request (instead of the module-level
//      singleton) — defeats any per-instance cache the singleton might
//      maintain across invocations on the same Vercel function instance
//   6. Per-response Cache-Control: no-store header (CDN/browser layer)
//
// PLUS a diagnostic audit_log INSERT logging the response body so we can
// verify what's actually being returned. Diagnostic block clearly marked
// for revert in a follow-up PR.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';
import { PENDING_ITEM_COLUMNS } from '@/app/admin/pending/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';

export async function GET(request: NextRequest) {
  // Runtime opt-out of any Next.js data caching for this request.
  noStore();

  const admin = verifyAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': NO_STORE } }
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-list-${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Cache-Control': NO_STORE } }
    );
  }

  // Fresh supabase client per request to defeat any singleton-level
  // caching. Slight per-request cost (~10ms) is fine for this admin
  // endpoint's traffic volume.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500, headers: { 'Cache-Control': NO_STORE } }
    );
  }
  const freshClient = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      // supabase-js calls fetch() under the hood. Wrap it to force
      // cache:'no-store' on every request — belt-and-braces with the
      // route's fetchCache export.
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' as RequestCache }),
    },
  });

  const { data, error } = await freshClient
    .from('shop_items')
    .select(PENDING_ITEM_COLUMNS)
    .eq('status', 'pending')
    .order('worker_submitted_at', { ascending: false });

  if (error) {
    console.error('[admin/pending] list query failed:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': NO_STORE } }
    );
  }

  const items = data ?? [];

  // ─── TEMP DIAGNOSTIC v4 — REMOVE IN FOLLOW-UP PR ─────────────────
  // Logs the response body to audit_log so we can read back what
  // the route ACTUALLY returns under v4's anti-caching stack. Compare
  // to PRs #30/31/32 v1/v2/v3 readings to confirm the cache defeat
  // works. Cleanup after verification:
  //   DELETE FROM audit_log WHERE action LIKE 'debug_%';
  try {
    interface ItemRow {
      id?: unknown;
      status?: unknown;
      worker_id?: unknown;
      ai_item_name?: unknown;
      worker_submitted_at?: unknown;
    }
    await supabaseAdmin.from('audit_log').insert({
      item_id: null,
      action: 'debug_pending_list_call_v4',
      actor_type: 'admin',
      actor_id: admin,
      metadata: {
        deploy_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
        x_vercel_id: request.headers.get('x-vercel-id'),
        host: request.headers.get('host'),
        response_count: items.length,
        response_rows: (items as ItemRow[]).map((r) => ({
          id: r.id ?? null,
          status: r.status ?? null,
          worker_id: r.worker_id ?? null,
          ai_item_name: r.ai_item_name ?? null,
          worker_submitted_at: r.worker_submitted_at ?? null,
        })),
      },
    });
  } catch (e) {
    console.error('[v4 diagnostic] insert failed:', e);
  }
  // ─── END TEMP DIAGNOSTIC v4 ──────────────────────────────────────

  return NextResponse.json(
    { items, count: items.length },
    { headers: { 'Cache-Control': NO_STORE } }
  );
}
