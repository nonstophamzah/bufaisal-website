// Resolver for the seven text fields the public site renders off
// `shop_items`. Prefers the publish-time `published_*` snapshot over the
// legacy mirror column.
//
// Why this exists:
//   During Phase 6 we mirror `published_*` back into the legacy columns
//   (`item_name`, `description`, `seo_title`, …) at admin-approval time
//   so the public site keeps rendering during the transition. Once
//   Phase 6.5 decommissions the legacy mirror block in
//   `admin-pending-publish.ts`, the legacy columns are no longer kept in
//   sync — only `published_*` is authoritative. Reading published-first
//   today means the public site stays correct through and beyond that
//   cleanup.
//
// Naming note:
//   `seo_description` (legacy) and `published_meta_description` (new) is
//   an intentional column-name mismatch, documented in the Decisions Log
//   v1.1. Same content, different column. Don't "fix" the name.
//
// Retirement:
//   This resolver retires in Phase 6.5 once the legacy mirror block in
//   `src/lib/admin-pending-publish.ts` is removed and the legacy text
//   columns are dropped from `shop_items`. At that point every caller
//   reads `published_*` directly.

import type { ShopItem } from './supabase';

export interface PublicItemFields {
  itemName: string | null;
  brand: string | null;
  category: string | null;
  productType: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

// `??` (not `||`) on every line: an empty string on a `published_*`
// column is treated as an intentional admin-set blank, not as "missing".
export function resolvePublicItemFields(item: ShopItem): PublicItemFields {
  return {
    itemName: item.published_item_name ?? item.item_name,
    brand: item.published_brand ?? item.brand,
    category: item.published_category ?? item.category,
    productType: item.published_product_type ?? item.product_type,
    description: item.published_description ?? item.description,
    seoTitle: item.published_seo_title ?? item.seo_title,
    seoDescription: item.published_meta_description ?? item.seo_description,
  };
}
