import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { CATEGORY_SLUG_MAP } from '@/lib/constants';
import ShopClient from './shop/shop-client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WhatsAppFloat from '@/components/WhatsAppFloat';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

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
    a: 'Tap the yellow WhatsApp button on any item. It opens WhatsApp with a pre-filled message. Our team will reply with the price, availability, and delivery options.',
  },
];

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

type Props = {
  searchParams: Promise<{ category?: string; q?: string }>;
};

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

export default async function HomePage({ searchParams }: Props) {
  const { category, q } = await searchParams;
  const items = await getItems(category, q);

  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Bu Faisal General Trading',
    description:
      "UAE's biggest used goods souq. Quality second-hand furniture, appliances & home goods since 2009.",
    url: 'https://bufaisal.ae',
    telephone: '+971585932499',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ajman',
      addressCountry: 'AE',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.4052,
      longitude: 55.5136,
    },
    openingHours: 'Mo-Su 09:00-22:00',
    priceRange: 'AED',
    image: 'https://bufaisal.ae/og-image.png',
    sameAs: [
      'https://www.instagram.com/bufaisal.ae',
      'https://www.tiktok.com/@bufaisal.ae',
      'https://www.facebook.com/bufaisal.ae',
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <Suspense
          fallback={
            <div className="pt-24 pb-16 max-w-7xl mx-auto px-4">
              <div className="animate-pulse space-y-4">
                <div className="h-12 bg-gray-100 rounded w-64" />
                <div className="h-12 bg-gray-100 rounded w-96" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-xl aspect-square" />
                  ))}
                </div>
              </div>
            </div>
          }
        >
          <ShopClient
            initialItems={items}
            initialCategory={category || ''}
            basePath="/"
          />
        </Suspense>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
