import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import ItemDetailClient from './item-detail-client';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// React.cache deduplicates across generateMetadata + page component
const getItem = cache(async (id: string): Promise<ShopItem | null> => {
  const { data } = await getSupabase()
    .from('shop_items')
    .select('*')
    .eq('id', id)
    .single();
  return data;
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return { title: 'Item Not Found' };

  const title = item.seo_title || `${item.item_name} — Bu Faisal`;
  const description =
    item.seo_description ||
    item.description ||
    `${item.item_name} available at Bu Faisal second-hand store in Ajman, UAE.`;
  const image = item.thumbnail_url || item.image_urls?.[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image && { images: [{ url: image, width: 1200, height: 630, alt: item.item_name }] }),
      type: 'website',
      url: `https://bufaisal.ae/item/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image && { images: [image] }),
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

  // Product JSON-LD structured data for Google Shopping / rich results
  const image = item.thumbnail_url || item.image_urls?.[0];
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.item_name,
    description:
      item.seo_description ||
      item.description ||
      `${item.item_name} available at Bu Faisal second-hand store.`,
    ...(image && { image: [image] }),
    ...(item.brand && item.brand !== 'Other' && {
      brand: { '@type': 'Brand', name: item.brand },
    }),
    ...(item.barcode && { sku: item.barcode }),
    url: `https://bufaisal.ae/item/${id}`,
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url: `https://bufaisal.ae/item/${id}`,
      priceCurrency: 'AED',
      ...(item.sale_price && { price: String(item.sale_price) }),
      ...(!item.sale_price && { price: '0', priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }),
      availability: item.is_sold
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'Bu Faisal General Trading',
      },
    },
    ...(item.category && { category: item.category }),
  };

  // BreadcrumbList JSON-LD
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bufaisal.ae' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: 'https://bufaisal.ae/shop' },
      ...(item.category ? [{
        '@type': 'ListItem', position: 3,
        name: item.category,
        item: `https://bufaisal.ae/shop?category=${encodeURIComponent(item.category)}`,
      }] : []),
      { '@type': 'ListItem', position: item.category ? 4 : 3, name: item.item_name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      <ItemDetailClient item={item} />
    </>
  );
}
