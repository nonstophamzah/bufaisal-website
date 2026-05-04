import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import { verifyShopSessionToken } from '@/lib/shop-session';

// PR #13: returns the count of items the named worker has uploaded
// today (UTC) at the authenticated shop. Powers the small "Today: X
// items uploaded" box at the top of /team upload step. The boundary
// is UTC midnight — Ajman shops are closed when that flips at 4am
// local, so the drift is invisible in practice.
export async function POST(request: NextRequest) {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenShop = token ? verifyShopSessionToken(token) : null;
  if (!tokenShop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`team-stats-${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let workerName: string | undefined;
  try {
    const body = await request.json();
    workerName = typeof body?.worker_name === 'string' ? body.worker_name.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!workerName) {
    return NextResponse.json({ error: 'Missing worker_name' }, { status: 400 });
  }

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from('shop_items')
    .select('id', { count: 'exact', head: true })
    .eq('shop_label', tokenShop)
    .eq('uploaded_by', workerName)
    .gte('created_at', startOfDayUtc.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ today_count: count ?? 0 });
}
