import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { CATEGORY_SLUG_MAP, SHOP_PAGE_SIZE, resolveCategorySlug, getCategoryDisplayName } from '@/lib/constants';
import ShopClient from './shop-client';
import { LOCAL_BUSINESS_SCHEMAS } from '@/lib/local-business-schema';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';
import { resolveItemImageUrl } from '@/lib/item-image';
import { getEffectivePrice } from '@/lib/effective-fields';
import { canonicalizeSearchTerm } from '@/lib/search-synonyms';
import { sortByCategoryPriority, hasCategoryPriority } from '@/lib/category-sort';

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
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { category } = await searchParams;
  // Canonical slug so legacy ?category= links produce the right title + a
  // canonical OG URL on the new slug.
  const slug = resolveCategorySlug(category);
  const catName = slug ? CATEGORY_SLUG_MAP[slug] : '';
  // Human-facing label for meta text; `catName`/`slug` stay canonical for the URL.
  const catDisplay = getCategoryDisplayName(catName);

  if (catName) {
    return {
      title: `Used ${catDisplay} in Dubai, Ajman, Sharjah | Bu Faisal`,
      description: `Buy quality second-hand ${catDisplay.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us. Established 2009.`,
      openGraph: {
        title: `Used ${catDisplay} for Sale | Bu Faisal`,
        description: `Buy quality second-hand ${catDisplay.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us.`,
        siteName: 'Bu Faisal',
        type: 'website',
        url: `https://bufaisal.ae/shop?category=${slug}`,
        images: [{ url: '/og-default.png', width: 1200, height: 630, alt: "Bu Faisal - UAE's Largest Used Goods Market" }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `Used ${catDisplay} for Sale | Bu Faisal`,
        description: `Buy quality second-hand ${catDisplay.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us.`,
        images: ['/og-default.png'],
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
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: "Bu Faisal - UAE's Largest Used Goods Market" }],
    },
    twitter: {
      card: 'summary_large_image',
      title: "Shop All Items | Bu Faisal General Trading",
      description: 'Browse thousands of quality second-hand items in Ajman, UAE. Furniture, appliances, electronics & more across 5 shops.',
      images: ['/og-default.png'],
    },
    alternates: {
      canonical: '/shop',
    },
  };
}

async function getItems(
  category?: string,
  q?: string,
  page = 1
): Promise<{ items: ShopItem[]; hasMore: boolean }> {
  let query = getSupabase()
    .from('shop_items')
    .select('*', { count: 'exact' })
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false);

  // Normalize legacy slugs (e.g. bedroom-sleep → bedroom) so old indexed links
  // still filter correctly after the 2026-06-21 category rename.
  const slug = resolveCategorySlug(category);
  if (slug && CATEGORY_SLUG_MAP[slug]) {
    query = query.eq('published_category', CATEGORY_SLUG_MAP[slug]);
  }

  if (q?.trim()) {
    // Rewrite synonyms (e.g. "couch" → "sofa") to the canonical catalog word for
    // the query only — the URL's ?q and the search box keep the original text.
    const term = canonicalizeSearchTerm(q);
    query = query.or(
      `published_item_name.ilike.%${term}%,published_brand.ilike.%${term}%,published_description.ilike.%${term}%`
    );
  }

  // ?page=N returns pages 1..N in one shot (range is inclusive on both ends), so
  // the feed height is reconstructed on back-nav and scroll restoration can land.
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const limit = safePage * SHOP_PAGE_SIZE;

  const catName =
    slug && CATEGORY_SLUG_MAP[slug] ? CATEGORY_SLUG_MAP[slug] : undefined;
  const prioritized = !!catName && hasCategoryPriority(catName);

  query = query
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  // Prioritized category pages need the priority tier computed across the WHOLE
  // category, not just the first page window — otherwise high-intent items that
  // are also old (beyond page 1 in recency order) stay buried. Categories are
  // far smaller than any realistic page depth (≤ a few hundred rows), so we
  // fetch the whole category, re-sort by priority, then slice to the page
  // window below. Non-prioritized feeds keep the lighter DB-range pagination.
  if (!prioritized) {
    query = query.range(0, limit - 1);
  }

  const { data, count } = await query;
  const items = (data || []) as ShopItem[];

  if (prioritized && catName) {
    // Stable priority re-sort across the full category; within a tier the
    // is_featured → created_at DESC → id DESC order above is preserved.
    const ordered = sortByCategoryPriority(items, catName);
    return { items: ordered.slice(0, limit), hasMore: ordered.length > limit };
  }

  const hasMore =
    count != null ? items.length < count : items.length === limit;
  return { items, hasMore };
}

export default async function ShopPage({ searchParams }: Props) {
  const { category, q, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
  const { items, hasMore } = await getItems(category, q, pageNum);

  // Server-side JSON-LD schemas (rendered in initial HTML).
  // LocalBusiness comes from the shared 5-shop registry; FAQ stays inline.
  // ItemList (category carousel signal) — same shape as the prior CSR
  // version in shop-client.tsx, but emitted in the SSR HTML so Googlebot
  // doesn't have to render JS to see it. Gated on `catName && items.length`
  // (no schema on the unfiltered /shop view, matching prior behavior).
  const catName = category ? CATEGORY_SLUG_MAP[resolveCategorySlug(category)] : '';
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
                  price: getEffectivePrice(item) || 0,
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
        <ShopClient
          initialItems={items}
          initialCategory={category || ''}
          initialHasMore={hasMore}
        />
      </Suspense>
    </>
  );
}
