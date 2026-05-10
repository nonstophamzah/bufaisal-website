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

// Cache-Control belt-and-braces: middleware applies no-store to every
// /api/* response, but this route had a real production cache-poisoning
// incident on 2026-05-10 (CDN served a stale response showing one
// archived row instead of the four actually-pending rows; see
// docs/PHASE_STATE.md). Setting no-store on the route response too so
// this endpoint stays protected even if the middleware layer ever
// changes.
const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';

export async function GET(request: NextRequest) {
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

  const { data, error } = await supabaseAdmin
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
  return NextResponse.json(
    { items, count: items.length },
    { headers: { 'Cache-Control': NO_STORE } }
  );
}
