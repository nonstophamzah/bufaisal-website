'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Search, X, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import ItemCard from '@/components/ItemCard';
import { supabase, ShopItem } from '@/lib/supabase';
import { CATEGORIES, CATEGORY_SLUG_MAP } from '@/lib/constants';

// ─── Static SEO intro per category ──────────────────────

const CATEGORY_INTROS: Record<string, string> = {
  'living-room-lounge':
    'Transform your home with quality pre-owned sofas, coffee tables, TV stands, and lounge furniture. Every piece is inspected for quality at our Ajman showrooms. Save up to 70% compared to buying new.',
  'bedroom-sleep':
    'Sleep better for less. Browse beds, mattresses, wardrobes, and bedroom furniture — all checked for quality and comfort. Delivery available across Dubai, Sharjah, and Ajman.',
  'kitchen-dining':
    'Equip your kitchen and dining area with affordable second-hand dining sets, tables, chairs, and cookware. Quality items from top brands at a fraction of the retail price.',
  'appliances':
    'Reliable used appliances — fridges, washing machines, ACs, microwaves, TVs, and more. All tested and working. Visit our 5 shops in Ajman or WhatsApp us for availability.',
  'outdoor-garden':
    'Create your perfect outdoor space with pre-owned garden furniture, BBQ sets, patio chairs, and camping gear. Built to last, priced to save.',
  'kids-baby':
    'Safe, affordable kids and baby essentials — cribs, strollers, toys, bikes, car seats, and study tables. Every item inspected for safety. Perfect for growing families on a budget.',
  'office-study-fitness':
    'Work from home or build your gym with used office desks, chairs, laptops, treadmills, and dumbbells. Professional quality at second-hand prices.',
  'everyday-essentials':
    'Bags, shoes, clothes, books, and everyday accessories at unbeatable prices. New items added daily across all 5 Bu Faisal shops in Ajman.',
};

// ─── FAQ data ────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────

function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('category') || ''
  );
  const [sortBy, setSortBy] = useState('newest');
  const [showCategories, setShowCategories] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const catName = activeCategory ? CATEGORY_SLUG_MAP[activeCategory] : '';

  // ─── Dynamic <title> and meta description ─────────────

  useEffect(() => {
    if (catName) {
      document.title = `Used ${catName} in Dubai, Ajman, Sharjah | Bu Faisal`;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) {
        desc.setAttribute(
          'content',
          `Buy quality second-hand ${catName.toLowerCase()} at affordable prices. Visit our 5 shops in Ajman or WhatsApp us. Established 2009.`
        );
      }
    } else {
      document.title =
        "Shop All Items | Bu Faisal General Trading | UAE's Biggest Used Goods Souq";
      const desc = document.querySelector('meta[name="description"]');
      if (desc) {
        desc.setAttribute(
          'content',
          'Browse thousands of quality second-hand items in Ajman, UAE. Furniture, appliances, electronics & more across 5 shops. Since 2009.'
        );
      }
    }
  }, [catName]);

  // ─── Fetch items ───────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('shop_items')
      .select('*')
      .eq('is_published', true)
      .eq('is_sold', false)
      .eq('is_hidden', false);

    if (activeCategory && CATEGORY_SLUG_MAP[activeCategory]) {
      query = query.eq('category', CATEGORY_SLUG_MAP[activeCategory]);
    }

    if (search.trim()) {
      query = query.or(
        `item_name.ilike.%${search.trim()}%,brand.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`
      );
    }

    query = query
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });

    const { data } = await query.limit(50);
    setItems(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, search, sortBy]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCategoryClick = (slug: string) => {
    const newCat = activeCategory === slug ? '' : slug;
    setActiveCategory(newCat);
    const params = new URLSearchParams();
    if (newCat) params.set('category', newCat);
    if (search) params.set('q', search);
    router.replace(`/shop?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (search.trim()) params.set('q', search.trim());
    router.replace(`/shop?${params.toString()}`);
  };

  // ─── JSON-LD schema ────────────────────────────────────

  const schemaJsonLd = useMemo(() => {
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
      sameAs: [],
    };

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

    const schemas: Record<string, unknown>[] = [localBusiness, faqSchema];

    if (catName && items.length > 0) {
      const productList = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Used ${catName} for Sale`,
        numberOfItems: items.length,
        itemListElement: items.slice(0, 10).map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: item.item_name,
            description: item.description || `Used ${item.item_name}`,
            url: `https://bufaisal.ae/item/${item.id}`,
            image: item.thumbnail_url || item.image_urls?.[0] || '',
            brand: { '@type': 'Brand', name: item.brand || 'Bu Faisal' },
            offers: {
              '@type': 'Offer',
              availability: 'https://schema.org/InStock',
              priceCurrency: 'AED',
              price: item.sale_price || 0,
              seller: { '@type': 'Organization', name: 'Bu Faisal General Trading' },
            },
            itemCondition: 'https://schema.org/UsedCondition',
          },
        })),
      };
      schemas.push(productList);
    }

    return schemas;
  }, [catName, items]);

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="pt-20 pb-16">
      {/* JSON-LD */}
      {schemaJsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted mb-4"
        >
          <Link href="/" className="hover:text-black transition-colors">
            Home
          </Link>
          <ChevronRight size={14} />
          <Link
            href="/shop"
            className={`hover:text-black transition-colors ${
              !activeCategory ? 'text-black font-medium' : ''
            }`}
          >
            Shop
          </Link>
          {catName && (
            <>
              <ChevronRight size={14} />
              <span className="text-black font-medium">{catName}</span>
            </>
          )}
        </nav>

        {/* H1 — dynamic */}
        <div className="mb-6">
          <h1 className="font-heading text-4xl md:text-5xl mb-2">
            {catName ? (
              <>
                USED{' '}
                <span className="text-yellow">{catName.toUpperCase()}</span>{' '}
                FOR SALE
              </>
            ) : (
              <>
                SHOP <span className="text-yellow">ALL ITEMS</span>
              </>
            )}
          </h1>
          {/* Category intro paragraph */}
          {activeCategory && CATEGORY_INTROS[activeCategory] ? (
            <p className="text-gray-600 max-w-2xl leading-relaxed">
              {CATEGORY_INTROS[activeCategory]}
            </p>
          ) : (
            <p className="text-muted">
              Browse our full collection of quality pre-owned goods across 5
              shops in Ajman, UAE.
            </p>
          )}
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name, brand..."
              className="w-full px-4 py-3 pl-11 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow text-base"
            />
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-black"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>

        {/* Active category chip + toggle */}
        <div className="flex items-center gap-3 mb-4">
          {activeCategory && (
            <button
              onClick={() => handleCategoryClick(activeCategory)}
              className="flex items-center gap-1.5 bg-yellow text-black px-4 py-2 rounded-xl text-sm font-semibold"
            >
              {CATEGORY_SLUG_MAP[activeCategory]}
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-black transition-colors"
          >
            {showCategories ? 'Hide' : 'Browse'} Categories
            {showCategories ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-yellow flex-shrink-0"
          >
            <option value="newest">Newest First</option>
            <option value="featured">Featured First</option>
          </select>
        </div>

        {/* Category image cards */}
        {showCategories && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  onClick={() => handleCategoryClick(cat.slug)}
                  className={`group relative overflow-hidden rounded-2xl aspect-[3/2] text-left transition-all ${
                    isActive
                      ? 'ring-3 ring-yellow ring-offset-2'
                      : 'hover:shadow-lg'
                  }`}
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                    <h3 className="font-heading text-xl sm:text-2xl text-white leading-tight">
                      {cat.name.toUpperCase()}
                    </h3>
                    <p className="text-white/70 text-xs sm:text-sm mt-0.5 line-clamp-1">
                      {cat.description}
                    </p>
                  </div>
                  {isActive && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-yellow rounded-full flex items-center justify-center">
                      <span className="text-black text-xs font-bold">
                        ✓
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Items grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-100 rounded-xl aspect-square"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-heading text-2xl mb-2">NO ITEMS FOUND</p>
            <p className="text-muted">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* ─── FAQ Section ───────────────────────────── */}
        <section className="mt-16 max-w-3xl">
          <h2 className="font-heading text-3xl md:text-4xl mb-6">
            FREQUENTLY ASKED <span className="text-yellow">QUESTIONS</span>
          </h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-sm md:text-base hover:bg-gray-50 transition-colors"
                >
                  {faq.q}
                  <ChevronDown
                    size={18}
                    className={`flex-shrink-0 ml-3 text-muted transition-transform ${
                      openFaq === i ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-20 pb-16 max-w-7xl mx-auto px-4">
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
      <ShopContent />
    </Suspense>
  );
}
