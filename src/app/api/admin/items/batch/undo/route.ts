import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';

// PR #15: undo a /batch action by restoring per-item flags from the
// captured previousStatus.
//
// Status mapping is lossy on purpose (one string vs three booleans):
// approximating the prior tab is fine for the 5-second undo window.
// If admins need pixel-perfect restoration they can flip individual
// items via the existing single-item buttons.

type ConceptualStatus = 'pending' | 'live' | 'sold' | 'hidden';

function flagsForStatus(status: ConceptualStatus): {
  is_published: boolean;
  is_sold: boolean;
  is_hidden: boolean;
} {
  switch (status) {
    case 'pending':
      return { is_published: false, is_sold: false, is_hidden: false };
    case 'live':
      return { is_published: true, is_sold: false, is_hidden: false };
    case 'sold':
      // We don't know whether the item was previously published, so
      // assume yes — sold items in Bufaisal are always coming from a
      // live state in the current admin flow.
      return { is_published: true, is_sold: true, is_hidden: false };
    case 'hidden':
      return { is_published: false, is_sold: false, is_hidden: true };
  }
}

const VALID_STATUSES: ConceptualStatus[] = ['pending', 'live', 'sold', 'hidden'];

export async function POST(request: NextRequest) {
  const adminName = verifyAdmin(request);
  if (!adminName) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-batch-undo-${ip}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a minute.' },
      { status: 429 }
    );
  }

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: 'items must be a non-empty array' },
      { status: 400 }
    );
  }

  const successIds: string[] = [];
  const errors: { itemId: string; error: string }[] = [];

  for (const raw of body.items as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as { itemId?: unknown; previousStatus?: unknown };
    const itemId = typeof entry.itemId === 'string' ? entry.itemId : null;
    const previousStatus = entry.previousStatus as ConceptualStatus;

    if (!itemId) {
      continue;
    }
    if (!VALID_STATUSES.includes(previousStatus)) {
      errors.push({ itemId, error: 'Invalid previousStatus' });
      continue;
    }

    const updates = flagsForStatus(previousStatus);

    const { error, count } = await supabaseAdmin
      .from('shop_items')
      .update(updates, { count: 'exact' })
      .eq('id', itemId);

    if (error) {
      errors.push({ itemId, error: error.message });
    } else if (!count) {
      // Row was deleted — undo is impossible.
      errors.push({ itemId, error: 'Item no longer exists' });
    } else {
      successIds.push(itemId);
    }
  }

  return NextResponse.json({
    success: successIds.length,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
