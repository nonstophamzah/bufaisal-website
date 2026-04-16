import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import MarketplaceClient from './marketplace-client';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export const metadata: Metadata = {
  title: "Bu Faisal | UAE's Largest Second-Hand Market — Used Furniture & Appliances",
  description:
    "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items across 5 showrooms in Ajman. 24-48hr delivery to Dubai, Sharjah & all UAE.",
  openGraph: {
    title: "Bu Faisal | UAE's Largest Second-Hand Market",
    description:
      "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
    siteName: 'Bu Faisal',
    type: 'website',
    url: 'https://bufaisal.ae',
  },
  alternates: {
    canonical: '/',
  },
};

async function getItems(): Promise<ShopItem[]> {
  const { data } = await getSupabase()
    .from('shop_items')
    .select('id, item_name, brand, category, sale_price, thumbnail_url, image_urls, condition, is_featured, is_sold, created_at, shop_source, barcode, description, product_type, condition_notes')
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  return (data || []) as ShopItem[];
}

export default async function HomePage() {
  const items = await getItems();

  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <MarketplaceClient initialItems={items} />
    </Suspense>
  );
}
