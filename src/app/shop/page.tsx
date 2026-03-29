'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import ItemCard from '@/components/ItemCard';
import { supabase, ShopItem } from '@/lib/supabase';
import { CATEGORIES, CATEGORY_SLUG_MAP } from '@/lib/constants';

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
  const [showCategories, setShowCategories] = useState(!searchParams.get('category'));

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

    if (sortBy === 'featured') {
      query = query
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });
    } else {
      query = query
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });
    }

    const { data } = await query.limit(50);
    setItems(data || []);
    setLoading(false);
  }, [activeCategory, search, sortBy]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCategoryClick = (slug: string) => {
    const newCat = activeCategory === slug ? '' : slug;
    setActiveCategory(newCat);
    if (newCat) setShowCategories(false);
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

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading text-4xl md:text-5xl mb-2">
            SHOP <span className="text-yellow">ALL ITEMS</span>
          </h1>
          <p className="text-muted">
            {activeCategory
              ? CATEGORY_SLUG_MAP[activeCategory]
              : 'Browse our full collection'}
          </p>
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
            {showCategories ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
                      <span className="text-black text-xs font-bold">✓</span>
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
                <div key={i} className="bg-gray-100 rounded-xl aspect-square" />
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
