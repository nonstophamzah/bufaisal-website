// Phase 5 admin pending dashboard — client-safe eligibility helpers.
//
// `src/lib/admin-pending-publish.ts` has the server-side version of these
// (importing supabaseAdmin), but the list view also needs to call them
// to render the Quick Approve button correctly. Extracted here so the
// client bundle doesn't pull in the server-only Supabase admin client.
//
// IMPORTANT: the server re-runs the same eligibility check inside the
// quick-approve route — this client-side check is purely UX. If these
// rules ever diverge, the server is the truth.

import type { PendingItem } from '../types';

export function hasAnyAdminOverride(item: PendingItem): boolean {
  return (
    item.admin_brand !== null ||
    item.admin_item_name !== null ||
    item.admin_product_type !== null ||
    item.admin_category !== null ||
    item.admin_seo_title !== null ||
    item.admin_meta_description !== null ||
    item.admin_description !== null ||
    item.admin_slug !== null ||
    item.admin_spec_table !== null ||
    item.admin_faqs !== null ||
    item.admin_trust_signals !== null ||
    item.admin_image_alt_texts !== null ||
    item.admin_geographic_anchor !== null ||
    item.admin_internal_link_targets !== null ||
    item.admin_condition_grade !== null ||
    item.admin_price_aed !== null ||
    item.admin_negotiable !== null
  );
}

export function isQuickApproveEligible(item: PendingItem): boolean {
  if (item.status !== 'pending') return false;
  if ((item.ai_confidence_score ?? 0) < 0.8) return false;
  if (Array.isArray(item.ai_flags) && item.ai_flags.length > 0) return false;
  if (hasAnyAdminOverride(item)) return false;
  return true;
}
