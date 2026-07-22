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
  // Phase 6.4 — JSONB layout/schema fields. No legacy mirror columns
  // exist for these (they were never in the pre-Phase-5 schema), so the
  // resolver degenerates to `?? null`. Still funneled through here for
  // the single Phase 6.5 retirement point.
  productSchema: Record<string, unknown> | null;
  faqSchema: Record<string, unknown> | null;
  specTable: Record<string, string> | null;
  faqs: Array<{ question: string; answer: string }> | null;
  trustSignals: string[] | null;
}

// `??` (not `||`) on every line: an empty string on a `published_*`
// column is treated as an intentional admin-set blank, not as "missing".
export function resolvePublicItemFields(item: ShopItem): PublicItemFields {
  // Brand is resolved published_* ?? legacy, then "Unknown" (case-
  // insensitive, trimmed) is treated as absent. The locked SEO Agent
  // prompt writes literal "Unknown" as an internal placeholder for
  // undeterminable brands; it must never render to customers. Nulling
  // it here ripples to ItemCard, item detail, buildWhatsAppUrl, and the
  // Product JSON-LD — all correctly omit brand when Unknown.
  const rawBrand = item.published_brand ?? item.brand;
  return {
    itemName: item.published_item_name ?? item.item_name,
    brand:
      rawBrand && rawBrand.trim().toLowerCase() !== 'unknown'
        ? rawBrand
        : null,
    category: item.published_category ?? item.category,
    productType: item.published_product_type ?? item.product_type,
    description: item.published_description ?? item.description,
    seoTitle: item.published_seo_title ?? item.seo_title,
    seoDescription: item.published_meta_description ?? item.seo_description,
    productSchema: item.published_product_schema ?? null,
    faqSchema: item.published_faq_schema ?? null,
    specTable: item.published_spec_table ?? null,
    faqs: item.published_faqs ?? null,
    trustSignals: item.published_trust_signals ?? null,
  };
}
