'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Search, X, MessageCircle, Zap } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl, CATEGORIES } from '@/lib/constants';
import { trackWhatsAppClick } from '@/lib/fbpixel';
import { useLang } from '@/lib/lang';

const CAT_PILLS = ['All', ...CATEGORIES.map((c) => c.name)];
const BATCH = 20;

function isNew(d: string) {
  return Date.now() - new Date(d).getTime() < 24 * 60 * 60 * 1000;
}

export default function MarketplaceClient({ initialItems }: { initialItems: ShopItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, toggle } = useLang();

  const [items] = useState<ShopItem[]>(initialItems);
  const [loading] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [cat, setCat] = useState(searchParams.get('category') || 'All');
  const [visible, setVisible] = useState(BATCH);

  // Client-side filter
  const filtered = items.filter((item) => {
    if (cat !== 'All' && item.category !== cat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.item_name?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (cat !== 'All') params.set('category', cat);
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }, [cat, search, router]);

  const handleWhatsApp = (item: ShopItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => {});
    trackWhatsAppClick();
    window.location.href = buildWhatsAppUrl(item);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 0A. HERO HEADLINE */}
      <section className="w-full py-10 px-4 text-center" style={{ background: '#111' }}>
        <h1 className="font-heading text-3xl md:text-5xl font-black tracking-tight leading-tight" style={{ color: '#F9D923' }}>
          UAE&apos;S LARGEST USED GOODS MARKET
        </h1>
        <p className="mt-3 text-base md:text-lg font-semibold" style={{ color: '#F9D923', opacity: 0.85 }}>
          Since 2009 &middot; Furniture, Appliances &amp; More &middot; New Arrivals Daily
        </p>
      </section>

      {/* 0B. TRUST BAR */}
      <div className="w-full py-3 px-4 flex items-center justify-center gap-3 md:gap-6 text-center flex-wrap" style={{ background: '#000', color: '#F9D923' }}>
        <span className="text-xs md:text-sm font-bold whitespace-nowrap">Since 2009</span>
        <span className="text-xs opacity-40 text-white">|</span>
        <span className="text-xs md:text-sm font-bold whitespace-nowrap">5 Showrooms in Ajman</span>
        <span className="text-xs opacity-40 text-white">|</span>
        <span className="text-xs md:text-sm font-bold whitespace-nowrap">All Items Inspected</span>
        <span className="text-xs opacity-40 text-white">|</span>
        <span className="text-xs md:text-sm font-bold whitespace-nowrap">24-48hr Delivery</span>
      </div>

      {/* 1. HEADER */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 flex items-center justify-between px-4" style={{ height: 50 }}>
        <button onClick={toggle} className="text-xs font-bold px-2 py-0.5 border border-black/20 rounded flex-shrink-0">
          {lang === 'en' ? 'عربي' : 'EN'}
        </button>
        <a
          href="https://wa.me/971585932499"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white"
          aria-label="WhatsApp"
        >
          <MessageCircle size={20} />
        </a>
      </div>

      {/* 3. SEARCH BAR */}
      <div className="px-3 pb-2">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisible(BATCH); }}
            placeholder='Search "washing machine", "sofa", "fridge"...'
            className="w-full pl-10 pr-10 py-3 text-sm bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 4. CATEGORY PILLS */}
      <div className="px-3 pb-2 overflow-x-auto hide-scrollbar">
        <div className="flex gap-1.5 min-w-max">
          {CAT_PILLS.map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); setVisible(BATCH); }}
              className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                cat === c ? 'bg-black text-yellow' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 5. ITEM COUNT + HOOK */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-500">
          <span className="font-bold text-black">{filtered.length}</span> items available &bull; New stuff added daily
        </p>
      </div>

      {/* 6. PRODUCT GRID */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 px-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl aspect-[3/4]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 px-4">
          <p className="font-heading text-2xl mb-2">NO ITEMS FOUND</p>
          <p className="text-gray-400 text-sm">Try a different search or category</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 px-3">
            {filtered.slice(0, visible).map((item) => {
              const img = item.thumbnail_url || item.image_urls?.[0];
              const hasPrice = item.sale_price && item.sale_price > 0;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <Link href={`/item/${item.id}`} className="block relative aspect-square bg-gray-100">
                    {img ? (
                      <Image src={img} alt={item.item_name} fill className="object-cover" sizes="(max-width:640px) 50vw, 25vw" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300"><Zap size={32} /></div>
                    )}
                    {isNew(item.created_at) && (
                      <span className="absolute top-2 right-2 bg-yellow text-black text-[10px] font-bold px-2 py-0.5 rounded-full">NEW</span>
                    )}
                  </Link>
                  <div className="p-2.5">
                    <Link href={`/item/${item.id}`}>
                      <p className="text-sm font-semibold line-clamp-2 leading-tight min-h-[2.5rem]">{item.item_name}</p>
                    </Link>
                    <p className="font-heading text-lg mt-0.5">
                      {hasPrice ? `AED ${item.sale_price}` : <span className="text-gray-400">Ask Price</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Only 1 &bull; First come first serve</p>
                    <button
                      onClick={(e) => handleWhatsApp(item, e)}
                      className="w-full mt-2 py-2.5 rounded-lg bg-green-500 text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <MessageCircle size={15} /> Ask
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {visible < filtered.length && (
            <div className="px-3 py-4">
              <button
                onClick={() => setVisible((v) => v + BATCH)}
                className="w-full py-3.5 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 active:scale-95"
              >
                Load more ({filtered.length - visible} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* 7. FOOTER */}
      <footer className="mt-8 border-t border-gray-100 px-4 py-6 text-center text-xs text-gray-400">
        <p className="mb-2">Since 2009 &bull; 5 Locations in Ajman &bull; Open 9AM-11PM</p>
        <div className="flex justify-center gap-4 mb-2">
          <Link href="/about" className="hover:text-black">About</Link>
          <a href="https://wa.me/971585932499" className="hover:text-black">Contact</a>
          <Link href="/login" className="hover:text-black">Login</Link>
        </div>
        <p>&copy; {new Date().getFullYear()} Bu Faisal General Trading</p>
      </footer>
    </div>
  );
}
