// Maps the 8 product category names used in shop_items.category to URL-safe slugs.
// The slug values here are the canonical URL form for v2 (/[category]/[slug]).

export const CATEGORY_NAME_TO_SLUG: Record<string, string> = {
  'Living Room & Lounge': 'living-room',
  'Bedroom & Sleep': 'bedroom',
  'Kitchen & Dining': 'kitchen-dining',
  'Appliances': 'appliances',
  'Outdoor & Garden': 'outdoor-garden',
  'Kids & Baby': 'kids-baby',
  'Office, Study & Fitness': 'office-study-fitness',
  'Everyday Essentials': 'everyday-essentials',
};

export const CATEGORY_SLUG_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_NAME_TO_SLUG).map(([name, slug]) => [slug, name]),
);

export function categoryToSlug(category: string): string {
  return CATEGORY_NAME_TO_SLUG[category] ?? '';
}

export function slugToCategory(slug: string): string | null {
  return CATEGORY_SLUG_TO_NAME[slug] ?? null;
}

export const CATEGORY_SLUGS = Object.values(CATEGORY_NAME_TO_SLUG);
