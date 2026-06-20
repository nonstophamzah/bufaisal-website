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
  // Note: specific-product terms "fridge"/"fridges"/"washer" are intentionally
  // NOT here — they fall through to the keyword search, where the synonym map
  // canonicalizes them ("fridge"→"refrigerator", "washer"→"washing machine") so
  // a shopper sees only those products, not the whole appliances category.
  { slug: 'appliances', terms: ['appliances', 'appliance', 'refrigerator', 'refrigerators', 'washing machine', 'ac', 'air conditioner', 'tv', 'television'] },
  { slug: 'bedroom-sleep', terms: ['beds', 'bed', 'bedroom', 'sleep', 'bedroom & sleep', 'wardrobe', 'wardrobes', 'closet', 'mattress', 'mattresses'] },
  { slug: 'living-room-lounge', terms: ['living room', 'sofa', 'sofas', 'couch', 'lounge', 'living room & lounge'] },
  { slug: 'kitchen-dining', terms: ['kitchen', 'dining', 'kitchen & dining', 'dining table', 'dining set'] },
  { slug: 'outdoor-garden', terms: ['outdoor', 'garden', 'outdoor & garden'] },
  { slug: 'kids-baby', terms: ['kids', 'baby', 'kids & baby'] },
  { slug: 'office-study-fitness', terms: ['office', 'fitness', 'gym', 'treadmill', 'office study fitness', 'office, study & fitness'] },
  { slug: 'everyday-essentials', terms: ['everyday', 'essentials', 'everyday essentials'] },
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
