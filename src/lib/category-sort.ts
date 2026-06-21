// Category sort-priority — pin high-intent items to the top of a category feed.
//
// Why this exists:
//   Customers landing on a category page were finding the high-intent items
//   (sofas, beds) buried under lower-intent ones (TV stands, wardrobes). This
//   re-orders a category's items so listings whose name matches a high-priority
//   keyword float to the top; everything else keeps its incoming order.
//
// How it works:
//   Pure, display-only re-sort applied AFTER the DB fetch (PostgREST can't
//   express a CASE in `.order()` without an RPC or a generated column, both of
//   which are schema changes). The DB still returns rows in the canonical
//   `is_featured → created_at DESC → id DESC` order; we stable-sort that window
//   by a per-category priority tier, so within a tier the existing recency order
//   is preserved untouched. No pagination/filter logic is affected — categories
//   are far smaller than SHOP_PAGE_SIZE, so the whole category is in the first
//   fetch window and no priority item can be stranded on a later page.
//
// Matching:
//   Matches on the resolved display name (published_item_name ?? item_name) —
//   the same text the customer sees — so legacy rows with a NULL
//   published_item_name still sort correctly. Lowercased, word-boundary regexes
//   where a substring would misfire (e.g. "bedside" must NOT match the "bed"
//   tier — it belongs in the nightstand tier).

import type { ShopItem } from './supabase';
import { resolvePublicItemFields } from './resolve-public-item-fields';

// Per-category priority rules, keyed by the canonical `published_category`
// value (see CATEGORIES in constants.ts). Array order IS the tier order:
// index 0 = tier 1 (highest). A name that matches no rule is "everything else"
// and sorts below all matched tiers. Categories absent from this map
// (Appliances, Kids & Baby, Outdoor & Garden, Everyday Essentials) are left in
// their incoming order.
const PRIORITY_RULES: Record<string, RegExp[]> = {
  'Bedroom & Sleep': [
    // king/queen/double/single/bunk/canopy/upholstered beds all literally
    // contain the word "bed". \b boundaries keep "bedside"/"bedroom" out.
    /\bbeds?\b/,
    /\bwardrobe/,
    /\bmattress/,
    /\bnightstand\b|\bbedside\b/,
  ],
  'Living Room & Lounge': [
    /\bsofa|\bsectional|\bcouch|\barmchair/,
    /\bcoffee table/,
    /\btv stand|\btv unit/,
  ],
  'Kitchen & Dining': [
    // "dining chair" must NOT match the table/set tier, so these phrases are
    // checked before the dining-chair tier below.
    /\bdining table|\bdining set/,
    /\bdining chair/,
    /\bkitchen cabinet/,
  ],
  'Office, Study & Fitness': [
    /\bdesk/,
    /\boffice chair/,
    /\btreadmill|\bexercise bike/,
    /\bfiling cabinet/,
  ],
};

// Sentinel tier for "everything else" — sorts after every matched tier.
const NO_MATCH = Number.MAX_SAFE_INTEGER;

/**
 * True if the given canonical `published_category` value has priority rules.
 * Callers use this to decide whether a category page needs the whole-category
 * fetch (so priority is computed across every page, not just the first window).
 */
export function hasCategoryPriority(categoryName: string): boolean {
  return categoryName in PRIORITY_RULES;
}

function priorityTier(name: string, rules: RegExp[]): number {
  const n = name.toLowerCase();
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].test(n)) return i;
  }
  return NO_MATCH;
}

/**
 * Re-orders a single category's items so high-intent listings float to the top.
 * `categoryName` is the canonical `published_category` value. Returns the input
 * array order unchanged for categories without priority rules. Pure — does not
 * mutate the input.
 */
export function sortByCategoryPriority(
  items: ShopItem[],
  categoryName: string,
): ShopItem[] {
  const rules = PRIORITY_RULES[categoryName];
  if (!rules) return items;

  // Decorate with the incoming index so the tie-break is an explicit stable
  // sort (don't rely solely on Array.prototype.sort stability): equal tiers
  // keep the DB's is_featured → created_at DESC → id DESC order.
  return items
    .map((item, idx) => ({
      item,
      idx,
      tier: priorityTier(resolvePublicItemFields(item).itemName ?? '', rules),
    }))
    .sort((a, b) => a.tier - b.tier || a.idx - b.idx)
    .map((x) => x.item);
}
