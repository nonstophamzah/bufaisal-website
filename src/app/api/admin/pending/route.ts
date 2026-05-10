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
    }
    await supabaseAdmin.from('audit_log').insert({
      item_id: null,
      action: 'debug_pending_list_call',
      actor_type: 'admin',
      actor_id: admin,
      metadata: {
        deployment_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
        deployment_url: process.env.VERCEL_URL ?? 'unknown',
        request: {
          host: request.headers.get('host'),
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
          user_agent: request.headers.get('user-agent')?.slice(0, 200),
          x_forwarded_for: request.headers.get('x-forwarded-for'),
          x_vercel_id: request.headers.get('x-vercel-id'),
        },
        response: {
          count: items.length,
          ids: (items as ItemRow[]).map((r) => r.id ?? null),
          rows: (items as ItemRow[]).map((r) => ({
            id: r.id ?? null,
            status: r.status ?? null,
            is_published: r.is_published ?? null,
            is_sold: r.is_sold ?? null,
            is_hidden: r.is_hidden ?? null,
            worker_id: r.worker_id ?? null,
            ai_item_name: r.ai_item_name ?? null,
            worker_submitted_at: r.worker_submitted_at ?? null,
          })),
        },
      },
    });
  } catch (logErr) {
    // Diagnostic write must NEVER break the actual response. Swallow.
    console.error('[admin/pending] diagnostic insert failed:', logErr);
  }
  // ─── END TEMP DIAGNOSTIC ────────────────────────────────────────

  return NextResponse.json({ items, count: items.length });
}
