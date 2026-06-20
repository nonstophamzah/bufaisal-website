// Maps colloquial search terms to the canonical word that actually appears in
// the catalog's published_item_name, so a synonym search hits the right items.
//
// Data-driven (2026-06-19 audit of visible published rows): titles use
// "refrigerator" (5, vs "fridge" 0), "washing machine" (9, vs "washer" 1),
// "sofa" (10, vs "couch" 0), "wardrobe" (17, vs "closet" 0), "tv" (37, vs
// "television" 0), and "ac" (20, vs "air conditioner" 0). So the canonical
// targets are those words — NOT the "proper" names, which return nothing.
//
// Keys are matched against the WHOLE normalized term (lowercased, trimmed,
// internal whitespace collapsed) — a bare "couch" is rewritten, but "couch
// cushion" is left alone, so we don't hijack legitimate multi-word queries.
const SEARCH_SYNONYMS: Record<string, string> = {
  fridge: 'refrigerator',
  fridges: 'refrigerator',
  refrigerators: 'refrigerator', // plural — catalog titles are singular (0 matches for "refrigerators")
  washer: 'washing machine',
  washers: 'washing machine',
  couch: 'sofa',
  closet: 'wardrobe',
  telly: 'tv',
  tele: 'tv',
  television: 'tv',
  'a/c': 'ac',
  'air conditioner': 'ac', // catalog uses "AC" — "air conditioner" matches 0 rows
};

// Returns the canonical query term for a raw search string. ONLY the query term
// is rewritten — callers keep the user's original text in the search box / URL.
// Falls through to the trimmed original when there's no synonym.
export function canonicalizeSearchTerm(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return SEARCH_SYNONYMS[t] ?? raw.trim();
}
