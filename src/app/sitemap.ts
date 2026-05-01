import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { categoryToSlug } from '@/lib/categories';

export const revalidate = 3600; // Regenerate sitemap hourly

const BASE_URL = 'https://bufaisal.ae';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);

  // Only include published items, using the new /[category]/[slug] structure.
  const { data: items } = await supabase
    .from('shop_items')
    .select('slug, category, updated_at')
    .eq('status', 'published')
    .not('slug', 'is', null);

  const itemEntries: MetadataRoute.Sitemap = (items || [])
    .map((item) => {
      const catSlug = categoryToSlug(item.category);
      if (!catSlug || !item.slug) return null;
      return {
        url: `${BASE_URL}/${catSlug}/${item.slug}`,
        lastModified: item.updated_at,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    ...itemEntries,
  ];
}
