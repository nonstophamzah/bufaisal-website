// Effective-value resolvers for `shop_items` columns where the admin
// override is read at render time rather than baked into a
// `published_*` snapshot.
//
// Why this exists:
//   Phase 1B added `admin_price_aed`, `admin_negotiable`, and
//   `admin_condition_grade`. There are no matching `published_price_aed`
//   / `published_negotiable` / `published_condition_grade` columns —
//   approval doesn't snapshot these. So every public-side render must
//   compute the effective value at read time: admin override → worker
//   value → (for price) the legacy `sale_price` mirror for pre-Phase-3
//   rows that don't carry worker_price_aed.
//
// Pure functions, no I/O. Imported by the item detail page, ItemCard,
// marketplace homepage, shop ItemList JSON-LD, the product feed,
// and the WhatsApp URL builder.

import type { ShopItem } from './supabase';

/**
 * Effective price in AED for public display.
 *
 * Chain: `admin_price_aed ?? worker_price_aed ?? sale_price ?? null`.
 *
 * `null` means "no price set" (the call site renders "Ask Price"). The
 * `sale_price` fallback covers pre-Phase-3 legacy rows where
 * `worker_price_aed` was never populated. `sale_price === 0` is treated
 * as "no price" by every caller, so the helper returns the raw number
 * (callers do the `> 0` check themselves to preserve existing semantics).
 */
export function getEffectivePrice(
  item: Pick<ShopItem, 'admin_price_aed' | 'worker_price_aed' | 'sale_price'>
): number | null {
  if (item.admin_price_aed !== null && item.admin_price_aed !== undefined) {
    return item.admin_price_aed;
  }
  if (item.worker_price_aed !== null && item.worker_price_aed !== undefined) {
    return item.worker_price_aed;
  }
  if (item.sale_price !== null && item.sale_price !== undefined) {
    return item.sale_price;
  }
  return null;
}
