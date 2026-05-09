import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { rescueStuckItems } from '@/lib/cleanup-stuck';

// Phase 4 cleanup cron — daily backstop on Hobby tier (Vercel rejects
// sub-daily crons on Hobby, see vercel.json). The 10-minute SLA from spec
// §4C is met IN PRACTICE by piggybacked cleanup on every /api/team/items
// submit; this daily route exists to catch the edge case where shop submit
// activity stops with a stuck item still in 'processing'.
//
// Auth: accepts Bearer matching CRON_SECRET (Vercel auto-injects this on
// scheduled cron triggers when CRON_SECRET is set in env vars) OR
// INTERNAL_API_SECRET (for manual ops triggers from scripts/curl).

export const dynamic = 'force-dynamic';

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
  const result = await rescueStuckItems();
  return NextResponse.json({ ok: true, cleaned: result.cleaned, items: result.ids });
}
