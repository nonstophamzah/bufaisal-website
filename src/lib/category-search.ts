// Category-name detection for the site's search boxes. When a shopper types a
// term that matches (or closely matches) one of the 8 category names, we redirect
// them to that category's page (/shop?category=<slug>) instead of running a
// keyword search. Targets are the canonical query-param category pages — note
// /appliances is the internal staff tracker, so the appliances *category* is the
// slug below.
//
// Shared by both the in-page search (src/app/shop/shop-client.tsx) and the
// global Navbar search (src/components/Navbar.tsx) so the two entry points behave
// identically. No 'use client' here — this is a pure module importable from both
// client components and server code.
export const CATEGORY_SEARCH_TRIGGERS: { slug: string; terms: string[] }[] = [
  // Only the category-level words redirect here. Every specific-product term
  // (fridge, refrigerator, washing machine, tv, ac, air conditioner, …) is
  // intentionally NOT a trigger — those fall through to the keyword search (with
  // synonym canonicalization in search-synonyms.ts) so a shopper sees just those
  // products, not the whole 22-item appliances category.
  // Slugs are canonical (post-2026-06-21 rename). Terms keep both old and new
  // category-name phrasings so either redirects correctly.
  { slug: 'appliances', terms: ['appliances', 'appliance'] },
  { slug: 'bedroom', terms: ['beds', 'bed', 'bedroom', 'sleep', 'bedroom & sleep', 'wardrobe', 'wardrobes', 'closet', 'mattress', 'mattresses'] },
  { slug: 'living-room', terms: ['living room', 'sofa', 'sofas', 'couch', 'lounge', 'living room & lounge'] },
  { slug: 'dining-kitchen', terms: ['kitchen', 'dining', 'dining & kitchen', 'kitchen & dining', 'dining table', 'dining set'] },
  { slug: 'outdoor-garden', terms: ['outdoor', 'garden', 'outdoor & garden'] },
  { slug: 'kids-baby', terms: ['kids', 'baby', 'kids & baby'] },
  { slug: 'office-fitness', terms: ['office', 'fitness', 'gym', 'treadmill', 'office & fitness', 'office study fitness', 'office, study & fitness'] },
  { slug: 'shoe-racks-shelves', terms: ['shoe rack', 'shoe racks', 'shoe racks & shelves', 'shelves', 'shelf', 'everyday', 'essentials', 'everyday essentials'] },
];

// Whole-term (not substring) match so legitimate product searches like
// "sofa bed" or "office chair" are not hijacked — only a bare category word
// redirects.
export function detectCategorySlug(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  for (const { slug, terms } of CATEGORY_SEARCH_TRIGGERS) {
    if (terms.includes(t)) return slug;
  }
  return null;
}
