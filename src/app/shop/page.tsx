import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { CATEGORY_SLUG_MAP } from '@/lib/constants';
import ShopClient from './shop-client';
import { LOCAL_BUSINESS_SCHEMAS } from '@/lib/local-business-schema';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';
import { resolveItemImageUrl } from '@/lib/item-image';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ─── FAQ data (duplicated here for server-side JSON-LD) ──
const FAQS = [
  {
    q: 'Do you deliver to Dubai?',
    a: 'Yes! We deliver across Dubai, Sharjah, Ajman, and all UAE emirates. WhatsApp us with the item you want and your location for a delivery quote.',
  },
  {
    q: 'How do I know the quality?',
    a: 'Every item is inspected before listing. We note the condition (Excellent, Good, or Fair) on each listing. You can also visit any of our 5 shops in Ajman to see items in person.',
  },
  {
    q: 'Can I visit your shop?',
    a: 'Absolutely! We have 5 shops (A through E) in Ajman, open daily. Walk in anytime to browse thousands of items across all categories.',
  },
  {
    q: 'How do I order via WhatsApp?',
    a: 'Tap the yellow PRICE button on any item. It opens WhatsApp with a pre-filled message. Our team will reply with the price, availability, and delivery options.',
  },
];

type Props = {
  searchParams: Promise<{ category?: string; q?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { category } = await searchParams;
  const catName = category ? CATEGORY_SLUG_MAP[category] : '';

  if (catName) {
    return {
      title: `Used ${catName} in Dubai, Ajman, Sharjah | Bu Faisal`,
      description: `Buy quality second-hand ${catName.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us. Established 2009.`,
      openGraph: {
        title: `Used ${catName} for Sale | Bu Faisal`,
        description: `Buy quality second-hand ${catName.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us.`,
        siteName: 'Bu Faisal',
        type: 'website',
        url: `https://bufaisal.ae/shop?category=${category}`,
      },
      alternates: {
        canonical: '/shop',
      },
    };
  }

  return {
    title: "Shop All Items | Bu Faisal General Trading | UAE's Biggest Used Goods Souq",
    description:
      'Browse thousands of quality second-hand items in Ajman, UAE. Furniture, appliances, electronics & more across 5 shops. Since 2009.',
    openGraph: {
      title: "Shop All Items | Bu Faisal General Trading",
      description: 'Browse thousands of quality second-hand items in Ajman, UAE. Furniture, appliances, electronics & more across 5 shops.',
      siteName: 'Bu Faisal',
      type: 'website',
      url: 'https://bufaisal.ae/shop',
    },
    alternates: {
      canonical: '/shop',
    },
  };
}

async function getItems(category?: string, q?: string): Promise<ShopItem[]> {
  let query = getSupabase()
    .from('shop_items')
    .select('*')
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false);

  if (category && CATEGORY_SLUG_MAP[category]) {
    query = query.eq('published_category', CATEGORY_SLUG_MAP[category]);
  }

  if (q?.trim()) {
    query = query.or(
      `published_item_name.ilike.%${q.trim()}%,published_brand.ilike.%${q.trim()}%,published_description.ilike.%${q.trim()}%`
    );
  }

  query = query
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  const { data } = await query.limit(50);
  return (data || []) as ShopItem[];
}

export default async function ShopPage({ searchParams }: Props) {
  const { category, q } = await searchParams;
  const items = await getItems(category, q);

  // Server-side JSON-LD schemas (rendered in initial HTML).
  // LocalBusiness comes from the shared 5-shop registry; FAQ stays inline.
  // ItemList (category carousel signal) — same shape as the prior CSR
  // version in shop-client.tsx, but emitted in the SSR HTML so Googlebot
  // doesn't have to render JS to see it. Gated on `catName && items.length`
  // (no schema on the unfiltered /shop view, matching prior behavior).
  const catName = category ? CATEGORY_SLUG_MAP[category] : '';
  const itemListSchema =
    catName && items.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Used ${catName} for Sale`,
          numberOfItems: items.length,
          itemListElement: items.slice(0, 10).map((item, i) => {
            const f = resolvePublicItemFields(item);
            return {
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'Product',
                name: f.itemName,
                description: f.description || `Used ${f.itemName}`,
                url: `https://bufaisal.ae/item/${item.id}`,
                image: resolveItemImageUrl(item) ?? '',
                brand: { '@type': 'Brand', name: f.brand || 'Bu Faisal' },
                offers: {
                  '@type': 'Offer',
                  availability: 'https://schema.org/InStock',
                  priceCurrency: 'AED',
                  price: item.sale_price || 0,
                  seller: {
                    '@type': 'Organization',
                    name: 'Bu Faisal General Trading',
                  },
                },
                itemCondition: 'https://schema.org/UsedCondition',
              },
            };
          }),
        }
      : null;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  return (
    <>
      {/* Server-rendered JSON-LD */}
      {LOCAL_BUSINESS_SCHEMAS.map((schema) => (
        <script
          key={(schema.sameAs as string[])[0]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, '\\u003c'),
          }}
        />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {itemListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c'),
          }}
        />
      )}

      <Suspense
        fallback={
          <div className="pt-24 pb-16 max-w-7xl mx-auto px-4">
            <div className="animate-pulse space-y-4">
              <div className="h-12 bg-gray-100 rounded w-64" />
              <div className="h-12 bg-gray-100 rounded w-96" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-gray-100 rounded-xl aspect-square"
                  />
                ))}
              </div>
            </div>
          </div>
        }
      >
        <ShopClient initialItems={items} initialCategory={category || ''} />
      </Suspense>
    </>
  );
}
