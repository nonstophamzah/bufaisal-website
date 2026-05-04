import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';

// PR #15: bulk operations across the four item tabs (pending, live,
// sold, hidden). One endpoint, action-dispatched.
//
// We don't run inside a transaction — Supabase JS doesn't expose one
// cheaply — so this is best-effort: we apply per-item updates
// sequentially and return per-item success/failure. Callers should
// surface the aggregated counts to the user.
//
// For `delete`, server-side gates the action on an admin-name
// allow-list (Hamzah, Yousuf, Ahmed). The other actions are
// available to any authenticated admin.
//
// The response also returns `previousStatuses` — a parallel array
// of conceptual statuses (pending|live|sold|hidden) captured BEFORE
// the change. The client uses this to power the Undo toast.

const MAX_BATCH = 200;
const ALLOWED_DELETERS = ['Hamzah', 'Yousuf', 'Ahmed'];

type BulkAction =
  | 'approve'
  | 'reject'
  | 'hide'
  | 'mark_sold'
  | 'mark_live'
  | 'delete';

const VALID_ACTIONS: BulkAction[] = [
  'approve',
  'reject',
  'hide',
  'mark_sold',
  'mark_live',
  'delete',
];

type ConceptualStatus = 'pending' | 'live' | 'sold' | 'hidden';

function statusFromFlags(item: {
  is_published: boolean;
  is_sold: boolean;
  is_hidden: boolean;
}): ConceptualStatus {
  // Match the same precedence as useAdminItems' tab filters: hidden
  // wins over sold wins over live, falling through to pending.
  if (item.is_hidden) return 'hidden';
  if (item.is_sold) return 'sold';
  if (item.is_published) return 'live';
  return 'pending';
}

function updatesForAction(action: BulkAction, adminName: string): Record<string, unknown> | null {
  // Returns the field updates to apply, or null when the action is a
  // delete (handled separately).
  switch (action) {
    case 'approve':
      return {
        is_published: true,
        is_sold: false,
        is_hidden: false,
        approved_by: adminName,
        approved_at: new Date().toISOString(),
        status: null,
      };
    case 'reject':
      // Soft-reject: hide the item rather than deleting. PR #16 will
      // layer reason capture on top.
      return { is_published: false, is_hidden: true };
    case 'hide':
      return { is_published: false, is_hidden: true };
    case 'mark_sold':
      return { is_sold: true };
    case 'mark_live':
      // Bulk "Move to Live" from the Hidden tab. Force-publish to
      // match the button label; admins who want a soft-unhide can use
      // the existing single-item Unhide button.
      return { is_hidden: false, is_published: true, is_sold: false };
    case 'delete':
      return null;
  }
}

export async function POST(request: NextRequest) {
  const adminName = verifyAdmin(request);
  if (!adminName) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-batch-${ip}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a minute.' },
      { status: 429 }
    );
  }

  let body: { itemIds?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }

  const action = body.action as BulkAction;
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Use one of: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
    return NextResponse.json({ error: 'itemIds must be a non-empty array' }, { status: 400 });
  }
  if (body.itemIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  const itemIds = body.itemIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (itemIds.length === 0) {
    return NextResponse.json({ error: 'No valid itemIds' }, { status: 400 });
  }

  if (action === 'delete' && !ALLOWED_DELETERS.includes(adminName)) {
    return NextResponse.json(
      { error: `Bulk delete is restricted to: ${ALLOWED_DELETERS.join(', ')}` },
      { status: 403 }
    );
  }

  // Snapshot current flags so we can return previousStatuses for undo.
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('shop_items')
    .select('id, is_published, is_sold, is_hidden')
    .in('id', itemIds);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const existingMap = new Map(
    (existing ?? []).map((row) => [row.id as string, row])
  );

  const updates = updatesForAction(action, adminName);

  const successIds: string[] = [];
  const errors: { itemId: string; error: string }[] = [];
  const previousStatuses: { itemId: string; previousStatus: ConceptualStatus }[] = [];

  for (const itemId of itemIds) {
    const before = existingMap.get(itemId);
    if (!before) {
      errors.push({ itemId, error: 'Not found' });
      continue;
    }

    if (action === 'delete') {
      const { error } = await supabaseAdmin
        .from('shop_items')
        .delete()
        .eq('id', itemId);
      if (error) {
        errors.push({ itemId, error: error.message });
      } else {
        successIds.push(itemId);
        // Delete is irreversible — we still capture status for symmetry
        // with non-destructive actions, but the undo route refuses to
        // act on it (the row is already gone).
        previousStatuses.push({ itemId, previousStatus: statusFromFlags(before) });
      }
      continue;
    }

    if (!updates) {
      errors.push({ itemId, error: 'No-op update' });
      continue;
    }

    const { error } = await supabaseAdmin
      .from('shop_items')
      .update(updates)
      .eq('id', itemId);

    if (error) {
      errors.push({ itemId, error: error.message });
    } else {
      successIds.push(itemId);
      previousStatuses.push({ itemId, previousStatus: statusFromFlags(before) });
    }
  }

  return NextResponse.json({
    success: successIds.length,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    previousStatuses,
    action,
    deletable: action !== 'delete',
  });
}
