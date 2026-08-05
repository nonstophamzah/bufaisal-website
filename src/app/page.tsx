import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { CATEGORY_SLUG_MAP, SHOP_PAGE_SIZE, resolveCategorySlug } from '@/lib/constants';
import ShopClient from './shop/shop-client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WhatsAppFloat from '@/components/WhatsAppFloat';
import { LOCAL_BUSINESS_SCHEMAS } from '@/lib/local-business-schema';
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

// Bare-homepage demand-priority order, by canonical `published_category` value.
// The interleave below round-robins one item per category per round in this
// order, so a batch upload of a single category can't flood the feed. A
// category not present here (or a null/unknown category) still appears — it's
// appended after the known ones — so no inventory is silently dropped.
const FEED_PRIORITY = [
  'Appliances',
  'Sofas & Seating',
  'Beds & Mattresses',
  'Bedroom Furniture',
  'Dining & Kitchen',
  'Office & Fitness',
  'Wardrobes & Storage',
  'Shoe Racks & Shelves',
  'Kids & Baby',
  'Outdoor & Garden',
  'Everyday Essentials',
];

// Deterministic 32-bit string hash → float in [0,1). FNV-1a with an avalanche
// finalizer so adjacent ids don't produce adjacent keys. Same input → same
// output on every server, so the shuffle is reproducible across requests.
function hash01(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Daily feed context, anchored to Asia/Dubai (fixed UTC+4, no DST). Both the
// shuffle seed and the "fresh" window flip ONLY at Dubai midnight, so the whole
// feed order is stable for the entire day — required for the slice-based
// pagination below (page N returns rows 0..N*size of one stable ordering, so a
// same-day visitor never sees a duplicate or skipped item across pages).
function dailyFeedContext(nowMs = Date.now()): { seed: string; freshThresholdMs: number } {
  const OFFSET = 4 * 3600 * 1000; // Dubai is UTC+4 year-round
  const dubai = new Date(nowMs + OFFSET); // UTC fields now read as Dubai wall time
  const y = dubai.getUTCFullYear();
  const m = dubai.getUTCMonth();
  const d = dubai.getUTCDate();
  const seed = `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  const startOfTodayMs = Date.UTC(y, m, d) - OFFSET;
  // "fresh" = created since the start of yesterday (Dubai) — a 24–48h rolling
  // window that only advances at midnight, matching the seed's stability.
  const freshThresholdMs = startOfTodayMs - 24 * 3600 * 1000;
  return { seed, freshThresholdMs };
}

// How hard fresh items are pulled up: a fresh item's shuffle key is multiplied
// by this (keys sort ascending), compressing fresh rows into the front ~35% of
// each category bucket. They still interleave with older rows whose random key
// also lands low, so recency is a boost, not a solid newest-first block.
const FRESH_COMPRESSION = 0.35;

// Category-balanced, daily-shuffled feed for the bare homepage. Featured items
// pin to the very top (in incoming order). The rest are grouped by
// published_category; within each bucket the order is a deterministic daily
// shuffle (so old inventory surfaces instead of staying buried under recent
// intake), with a mild recency boost for items published in the last ~48h.
// Buckets are then emitted round-robin in FEED_PRIORITY order so no single
// category can flood the feed. Empty categories are skipped silently. Pure:
// does not mutate the input.
function interleaveByCategory(
  items: ShopItem[],
  ctx: { seed: string; freshThresholdMs: number } = dailyFeedContext(),
): ShopItem[] {
  const { seed, freshThresholdMs } = ctx;
  const featured = items.filter((it) => it.is_featured);
  const rest = items.filter((it) => !it.is_featured);

  // Precompute a stable per-item sort key: daily-seeded random, compressed
  // toward the front for fresh rows. Cached by id to avoid re-hashing in sort.
  const keyById = new Map<string, number>();
  for (const it of rest) {
    const rand = hash01(`${seed}:${it.id}`);
    const created = it.created_at ? Date.parse(it.created_at) : 0;
    const fresh = Number.isFinite(created) && created >= freshThresholdMs;
    keyById.set(it.id, fresh ? rand * FRESH_COMPRESSION : rand);
  }

  // Group the non-featured rows by category, then shuffle within each bucket.
  const buckets = new Map<string, ShopItem[]>();
  for (const it of rest) {
    const cat = it.published_category ?? '__uncategorized__';
    const bucket = buckets.get(cat);
    if (bucket) bucket.push(it);
    else buckets.set(cat, [it]);
  }
  for (const bucket of Array.from(buckets.values())) {
    bucket.sort((a, b) => keyById.get(a.id)! - keyById.get(b.id)!);
  }

  // Known categories first in demand order, then any leftover buckets (unknown
  // or null category) in first-seen order so nothing is dropped.
  const order = [
    ...FEED_PRIORITY.filter((c) => buckets.has(c)),
    ...Array.from(buckets.keys()).filter((c) => !FEED_PRIORITY.includes(c)),
  ];

  const interleaved: ShopItem[] = [];
  for (let round = 0, added = true; added; round++) {
    added = false;
    for (const cat of order) {
      const bucket = buckets.get(cat)!;
      if (round < bucket.length) {
        interleaved.push(bucket[round]);
        added = true;
      }
    }
  }

  return [...featured, ...interleaved];
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
    // Explicit branded card. A page-level openGraph REPLACES the layout's
    // (Next merges openGraph shallowly), so without this key the homepage
    // emitted no og:image and WhatsApp scraped the first product photo instead.
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: "Bu Faisal - UAE's Largest Used Goods Market" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Bu Faisal | UAE's Largest Second-Hand Market",
    description:
      "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
    images: ['/og-default.png'],
  },
  alternates: {
    canonical: '/',
  },
};

type Props = {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
};

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

  // Bare homepage (no category, no search): demand-balanced interleave instead
  // of pure recency, so a batch upload of one category can't flood the feed.
  // Fetch the whole visible catalog newest-first, round-robin across categories
  // in FEED_PRIORITY order, then slice to the page window (pages 1..N in one
  // shot, same contract as below). Category pages and search are left to the
  // untouched recency/priority path that follows.
  if (!catName && !q?.trim()) {
    const { data } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    const ordered = interleaveByCategory((data || []) as ShopItem[]);
    return { items: ordered.slice(0, limit), hasMore: ordered.length > limit };
  }

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

export default async function HomePage({ searchParams }: Props) {
  const { category, q, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
  const { items, hasMore } = await getItems(category, q, pageNum);

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
            initialHasMore={hasMore}
            basePath="/"
          />
        </Suspense>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
