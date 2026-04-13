import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import ItemDetailClient from './item-detail-client';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getItem(id: string): Promise<ShopItem | null> {
  const { data } = await getSupabase()
    .from('shop_items')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return { title: 'Item Not Found' };

  const title = item.seo_title || `${item.item_name} — Bu Faisal`;
  const description =
    item.seo_description ||
    item.description ||
    `${item.item_name} available at Bu Faisal second-hand store in Abu Dhabi.`;
  const image = item.thumbnail_url || item.image_urls?.[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image && { images: [{ url: image }] }),
      type: 'website',
      url: `https://bufaisal.ae/item/${id}`,
    },
    alternates: {
      canonical: `/item/${id}`,
    },
  };
}

export default async function ItemDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  // Increment views server-side (fire-and-forget)
  getSupabase().rpc('increment_views', { item_id: id }).then(() => {});

  return <ItemDetailClient item={item} />;
}
