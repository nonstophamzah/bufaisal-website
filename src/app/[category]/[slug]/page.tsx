import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { slugToCategory } from '@/lib/categories';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const getItem = cache(async (categoryName: string, slug: string): Promise<ShopItem | null> => {
  const { data } = await getSupabase()
    .from('shop_items')
    .select('*')
    .eq('category', categoryName)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
});

type Props = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const categoryName = slugToCategory(category);
  if (!categoryName) return { title: 'Not Found' };

  const item = await getItem(categoryName, slug);
  if (!item) return { title: 'Not Found' };

  return {
    title: item.seo_title || `${item.item_name} — Bu Faisal`,
    description: item.seo_description || item.description || `${item.item_name} at Bu Faisal.`,
    alternates: { canonical: `/${category}/${slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const { category, slug } = await params;
  const categoryName = slugToCategory(category);
  if (!categoryName) notFound();

  const item = await getItem(categoryName, slug);
  if (!item) notFound();

  return (
    <main className="min-h-screen pt-20 px-4">
      <div className="max-w-3xl mx-auto py-16">
        <p className="text-xs uppercase tracking-wide text-muted mb-2">{item.category}</p>
        <h1 className="font-heading text-3xl mb-4">{item.item_name}</h1>
        <div className="rounded-xl border border-yellow/40 bg-yellow/10 p-6 text-sm">
          Product page rebuild coming in next prompt.
        </div>
      </div>
    </main>
  );
}
