'use client';

import { useState, useCallback, useEffect, useRef, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import ItemCard from '@/components/ItemCard';
import { supabase, ShopItem } from '@/lib/supabase';
import { CATEGORIES, CATEGORY_SLUG_MAP, SHOP_PAGE_SIZE } from '@/lib/constants';
import { detectCategorySlug } from '@/lib/category-search';
import { canonicalizeSearchTerm } from '@/lib/search-synonyms';

const CATEGORY_INTROS: Record<string, string> = {
  'living-room-lounge':
    'Transform your home with quality pre-owned sofas, coffee tables, TV stands, and lounge furniture. Every piece is inspected for quality at our Ajman showrooms. Save up to 70% compared to buying new.',
  'bedroom-sleep':
    'Sleep better for less. Browse beds, mattresses, wardrobes, and bedroom furniture — all checked for quality and comfort. Delivery available across all UAE emirates.',
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

// PR #14: pill-shaped bubble for the horizontal category bar. Yellow
// fill when selected, light grey when not. min-h-[44px] keeps the tap
// target at the iOS guideline minimum on mobile.
function CategoryBubble({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`min-h-[44px] flex-shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
        selected
          ? 'bg-yellow text-black'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
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
    a: 'Tap the yellow PRICE button on any item. It opens WhatsApp with a pre-filled message. Our team will reply with the price, availability, and delivery options.',
  },
];

export default function ShopClient({
  initialItems,
  initialCategory,
  initialHasMore,
  basePath = '/shop',
}: {
  initialItems: ShopItem[];
  initialCategory: string;
  initialHasMore?: boolean;
  basePath?: '/' | '/shop';
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isHome = basePath === '/';
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasMore, setHasMore] = useState(
    initialHasMore ?? initialItems.length >= SHOP_PAGE_SIZE
  );
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [sortBy, setSortBy] = useState('newest');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Monotonic id for client-side fetches. A response is only applied if it's
  // still the latest request — so a slow in-flight keyword fetch (or one
  // superseded by an SSR navigation) can't clobber the displayed list.
  const reqIdRef = useRef(0);

  // Category and page-depth are URL-driven so they survive back/forward nav and
  // reconstruct the feed height for scroll restoration. Search stays local state
  // for instant as-you-type filtering. activeCategory falls back to the SSR prop.
  const activeCategory = searchParams.get('category') ?? initialCategory ?? '';
  const pageNum = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const catName = activeCategory ? CATEGORY_SLUG_MAP[activeCategory] : '';

  // "Showing X for 'term'" label after a keyword→category redirect. Driven by the
  // `redirectedFrom` URL param (set by the redirect) so it survives both a fresh
  // mount and a same-route navigation, and a local dismiss flag for the in-place
  // clears. Category name comes from the URL too, so it's correct even when
  // activeCategory state hasn't re-synced on a same-route push. Display only —
  // `redirectedFrom` never feeds buildQuery, so it has no effect on results.
  const redirectedFrom = searchParams.get('redirectedFrom') || '';
  const redirectedCatName =
    CATEGORY_SLUG_MAP[searchParams.get('category') || ''] || '';
  const [labelDismissed, setLabelDismissed] = useState(false);
  // A fresh redirect (new term) revives the label even if a prior one was dismissed.
  useEffect(() => {
    setLabelDismissed(false);
  }, [redirectedFrom]);
  const showRedirectLabel = !!redirectedFrom && !!redirectedCatName && !labelDismissed;

  // Strip `redirectedFrom` from the URL (the label's X). Drops only that param;
  // keeps the category filter intact.
  const dismissRedirectLabel = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('redirectedFrom');
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath);
  };

  // Shared filter/sort builder so the reset fetch and "Load More" page the
  // same result set (same WHERE + ORDER) — only the .range() differs.
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('shop_items')
      .select('*', { count: 'exact' })
      .eq('is_published', true)
      .eq('is_sold', false)
      .eq('is_hidden', false);

    if (activeCategory && CATEGORY_SLUG_MAP[activeCategory]) {
      query = query.eq('published_category', CATEGORY_SLUG_MAP[activeCategory]);
    }

    if (search.trim()) {
      // Rewrite synonyms (e.g. "couch" → "sofa") to the canonical catalog word
      // for the query only — the box keeps the user's original text.
      const term = canonicalizeSearchTerm(search);
      query = query.or(
        `published_item_name.ilike.%${term}%,published_brand.ilike.%${term}%,published_description.ilike.%${term}%`
      );
    }

    return query
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  }, [activeCategory, search]);

  // Re-fetch (page 0) when filters change client-side
  const fetchItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const { data, count } = await buildQuery().range(0, SHOP_PAGE_SIZE - 1);
    // Bail if a newer fetch or an SSR navigation has superseded this one — its
    // stale rows must not overwrite the current list (e.g. a partial-term
    // keyword fetch resolving after a category redirect).
    if (reqId !== reqIdRef.current) return;
    const rows = (data || []) as ShopItem[];
    setItems(rows);
    setHasMore(count != null ? rows.length < count : rows.length === SHOP_PAGE_SIZE);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQuery, sortBy]);

  // Sync the displayed list with whatever the server returned for the current
  // URL. The server component only re-runs on navigation (filter push, page
  // replace, or back/forward), so initialItems' identity is stable between
  // navigations — this never fights the client-side live-search fetch below.
  useEffect(() => {
    // The SSR payload is authoritative — adopt it UNCONDITIONALLY (no reqId
    // guard; it must always win). THEN bump reqIdRef so any client fetch that is
    // still in flight is treated as stale and can't overwrite these rows.
    setItems(initialItems);
    setHasMore(initialHasMore ?? initialItems.length >= SHOP_PAGE_SIZE);
    setLoading(false);
    reqIdRef.current++;
  }, [initialItems, initialHasMore]);

  // Load more = bump ?page in the URL (replace, so it doesn't pollute history)
  // and let SSR return pages 1..N in one shot. scroll:false keeps the viewport
  // put — the navigation must not jump to the top. Carries the current filters
  // (and the redirect label) forward so depth is scoped to this exact view.
  const loadMore = useCallback(() => {
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (search.trim()) params.set('q', search.trim());
    const rf = searchParams.get('redirectedFrom');
    if (rf) params.set('redirectedFrom', rf);
    params.set('page', String(pageNum + 1));
    startTransition(() => {
      router.replace(`${basePath}?${params.toString()}`, { scroll: false });
    });
  }, [activeCategory, search, pageNum, searchParams, basePath, router]);

  // Infinite scroll: when the bottom sentinel scrolls into view (with a 400px
  // pre-load margin), fetch the next page. The effect re-runs after each append
  // (loadMore identity changes with items.length), re-attaching to the moved
  // sentinel. Guards prevent overlapping or post-exhaustion fetches.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isPending && !loading) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isPending, loading, loadMore]);

  // Category-name redirect is handled ONLY on submit (Enter / search button) in
  // handleSearch below — never on keystroke. A live, per-keystroke redirect was
  // removed because it cleared the box mid-typing the instant a whole-term match
  // appeared (e.g. "fridge", or "bed" while typing "bedside").

  // Live as-you-type search runs client-side for instant feedback. Fires only for
  // a non-empty term: an empty box (cleared, or never typed) falls through to the
  // URL/SSR-driven list via the sync effect above. Category-name terms are left
  // for submit-time redirect, so we skip them here. Category + page changes are
  // URL-driven and do NOT trigger this — they re-render from SSR props.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    const term = search.trim();
    if (!term || detectCategorySlug(term)) return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filter changes use push so each creates a history entry — back steps through
  // the filter states. Omitting `page` resets depth to 1; omitting `redirectedFrom`
  // clears the redirect label.
  const writeUrl = (cat: string, q: string) => {
    const params = new URLSearchParams();
    if (cat) params.set('category', cat);
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const handleCategoryClick = (slug: string) => {
    const newCat = activeCategory === slug ? '' : slug;
    writeUrl(newCat, search);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = detectCategorySlug(search);
    if (slug) {
      // Category term → full-page navigation to the category view. The URL carries
      // ONLY category + redirectedFrom — never ?q — so the term can't be applied
      // as a keyword filter against item names (which is why "appliances" must
      // show the category, not 0 results). Clearing the box guards the edge case
      // where the browser treats the navigation as a same-URL no-op. The full
      // reload remounts /shop fresh from SSR, sidestepping client-state timing.
      const term = search.trim();
      setSearch('');
      window.location.href = `/shop?category=${slug}&redirectedFrom=${encodeURIComponent(
        term
      )}`;
      return;
    }
    writeUrl(activeCategory, search);
  };

  return (
    <div className="pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs — hidden on /, visible on /shop and /shop?category=… */}
        {!isHome && (
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
        )}
        {isHome && catName && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-muted mb-4"
          >
            <Link href="/" className="hover:text-black transition-colors">
              Home
            </Link>
            <ChevronRight size={14} />
            <span className="text-black font-medium">{catName}</span>
          </nav>
        )}

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

        {/* Keyword→category redirect notice. Display only — does not filter. */}
        {showRedirectLabel && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
            <span>
              Showing <span className="font-medium">{redirectedCatName}</span> for{' '}
              <span className="font-medium">&ldquo;{redirectedFrom}&rdquo;</span>
            </span>
            <button
              type="button"
              onClick={dismissRedirectLabel}
              className="text-muted hover:text-black"
              aria-label="Clear redirect notice"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Using the search box again dismisses the redirect notice.
                if (redirectedFrom) setLabelDismissed(true);
              }}
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
                onClick={() => {
                  setSearch('');
                  // Drop ?q and restore the URL/SSR-driven list (the live-search
                  // effect intentionally no-ops on an empty term).
                  writeUrl(activeCategory, '');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-black"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>

        {/* PR #14: sticky horizontal bubble bar replaces the giant
            stock-photo category grid. The negative margins bleed the
            white background to the container's content edges so the
            bar feels full-width when stuck to the top. top-24 sits
            just below the fixed Navbar (h-16) plus TrustStrip. */}
        <div className="sticky top-24 z-30 -mx-4 sm:-mx-6 lg:-mx-8 bg-white border-b border-gray-100 mb-4">
          <div
            className="flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-3 overflow-x-auto hide-scrollbar"
            role="tablist"
            aria-label="Categories"
          >
            <CategoryBubble
              label="All"
              selected={!activeCategory}
              onClick={() => {
                if (activeCategory) writeUrl('', search);
              }}
            />
            {CATEGORIES.map((cat) => (
              <CategoryBubble
                key={cat.slug}
                label={cat.name}
                selected={activeCategory === cat.slug}
                onClick={() => handleCategoryClick(cat.slug)}
              />
            ))}
          </div>
        </div>

        {/* Sort + future filters row */}
        <div className="flex items-center mb-4">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-yellow flex-shrink-0"
          >
            <option value="newest">Newest First</option>
            <option value="featured">Featured First</option>
          </select>
        </div>

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
            {activeCategory ? (
              <>
                <p className="font-heading text-2xl mb-2">NOTHING IN THIS CATEGORY YET</p>
                <p className="text-muted mb-5">
                  No items in this category yet. Browse all items?
                </p>
                <button
                  type="button"
                  onClick={() => writeUrl('', search)}
                  className="inline-flex items-center gap-2 bg-yellow text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-yellow/90 transition-colors"
                >
                  Show all items
                </button>
              </>
            ) : (
              <>
                <p className="font-heading text-2xl mb-2">NO ITEMS FOUND</p>
                <p className="text-muted">Try adjusting your search.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>

            {hasMore && (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                className="mt-8 flex justify-center"
                style={{ minHeight: 1 }}
              >
                {isPending && (
                  <div
                    role="status"
                    aria-label="Loading more items"
                    className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* FAQ Section */}
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
