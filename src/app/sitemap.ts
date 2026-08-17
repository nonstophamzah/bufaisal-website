import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CATEGORIES } from '@/lib/constants';

export const revalidate = 3600; // Regenerate sitemap hourly

const BASE_URL = 'https://bufaisal.ae';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);

  // Only include published, non-sold items
  const { data: items } = await supabase
    .from('shop_items')
    .select('id, updated_at')
    .eq('is_published', true)
    .eq('is_sold', false);

  const itemEntries: MetadataRoute.Sitemap = (items || []).map((item) => ({
    url: `${BASE_URL}/item/${item.id}`,
    lastModified: item.updated_at,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Filtered category URLs. Per Architecture decision 2.4 these are the
  // intended long-tail landing pages, and as of 2026-08-17 they finally
  // canonical to themselves — before that they all declared themselves
  // duplicates of /shop, so listing them here would have reinforced the wrong
  // signal. Until now they were discoverable only via /categories and the
  // RelatedCategories strip, i.e. indexation depended on internal linking.
  //
  // Deliberately EXCLUDED, so this file lists only canonical indexable URLs:
  //   - the 6 legacy alias slugs — they canonical to their resolved slug
  //   - categories with 0 visible items — same rule as the noindex in
  //     shop/page.tsx. Threshold is exactly 0: inventory turns over daily and
  //     a "thin" threshold would flap categories in and out of the sitemap.
  //     A category re-enters on its own as soon as it has stock.
  //   - every ?q=, ?page= and ?redirectedFrom= URL
  const { data: catRows } = await supabase
    .from('shop_items')
    .select('published_category, published_at, updated_at')
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false);

  // Freshest publish per category — a real signal that moves as stock turns
  // over, rather than a synthetic new Date() on every regeneration.
  const freshestByCategory = new Map<string, string>();
  for (const row of catRows || []) {
    const cat = row.published_category;
    if (!cat) continue;
    const stamp = row.published_at ?? row.updated_at;
    if (!stamp) continue;
    const current = freshestByCategory.get(cat);
    if (!current || stamp > current) freshestByCategory.set(cat, stamp);
  }

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.filter((c) =>
    freshestByCategory.has(c.name),
  ).map((c) => ({
    url: `${BASE_URL}/shop?category=${c.slug}`,
    lastModified: freshestByCategory.get(c.name),
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    ...categoryEntries,
    ...itemEntries,
  ];
}
