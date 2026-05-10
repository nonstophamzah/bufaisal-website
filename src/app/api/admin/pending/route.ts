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
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  // ── TEMP v3 DIAGNOSTIC — heartbeat at TOP, before auth or query ──
  // v2 returned zero audit_log entries. Either v2's diagnostic block
  // threw before the audit_log INSERT, or the response was served from
  // a cache and the function never fired. v3 writes the heartbeat BEFORE
  // anything else so any function invocation produces an audit_log row.
  const requestId = Math.random().toString(36).slice(2, 10);
  const deploySha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown';
  try {
    await supabaseAdmin.from('audit_log').insert({
      item_id: null,
      action: 'debug_pending_list_call_v3_heartbeat',
      actor_type: 'system',
      actor_id: deploySha,
      metadata: {
        request_id: requestId,
        deploy_sha: deploySha,
        host: request.headers.get('host'),
        x_vercel_id: request.headers.get('x-vercel-id'),
        x_vercel_cache: request.headers.get('x-vercel-cache'),
        cf_ray: request.headers.get('cf-ray'),
        user_agent: request.headers.get('user-agent')?.slice(0, 100),
        timestamp: new Date().toISOString(),
        env_supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING',
      },
    });
  } catch (e) {
    console.error('[v3 heartbeat] insert failed:', e);
  }

  const admin = verifyAdmin(request);
  if (!admin) {
    const r = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    r.headers.set('x-debug-deploy', deploySha);
    r.headers.set('x-debug-request', requestId);
    r.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    return r;
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-pending-list-${ip}`, 60, 60_000);
  if (!allowed) {
    const r = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    r.headers.set('x-debug-deploy', deploySha);
    r.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    return r;
  }

  const { data, error } = await supabaseAdmin
    .from('shop_items')
    .select(PENDING_ITEM_COLUMNS)
    .eq('status', 'pending')
    .order('worker_submitted_at', { ascending: false });

  if (error) {
    console.error('[admin/pending] list query failed:', error);
    const r = NextResponse.json({ error: error.message }, { status: 500 });
    r.headers.set('x-debug-deploy', deploySha);
    r.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    return r;
  }

  const items = data ?? [];

  // ── TEMP v3 DIAGNOSTIC — log the actual response payload ──
  try {
    interface ItemRow { id?: unknown; status?: unknown; worker_id?: unknown; ai_item_name?: unknown; worker_submitted_at?: unknown; }
    await supabaseAdmin.from('audit_log').insert({
      item_id: null,
      action: 'debug_pending_list_call_v3_response',
      actor_type: 'admin',
      actor_id: admin,
      metadata: {
        request_id: requestId,
        deploy_sha: deploySha,
        admin,
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
    console.error('[v3 response] insert failed:', e);
  }

  // Force cache bypass via response headers AND attach debug headers.
  const r = NextResponse.json({ items, count: items.length });
  r.headers.set('x-debug-deploy', deploySha);
  r.headers.set('x-debug-request', requestId);
  r.headers.set('x-debug-count', String(items.length));
  r.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  return r;
}
