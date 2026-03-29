'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, Star } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl } from '@/lib/constants';
import { trackWhatsAppClick } from '@/lib/fbpixel';

function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) return null;
  const color =
    condition === 'Excellent'
      ? 'bg-green-500 text-white'
      : condition === 'Good'
        ? 'bg-yellow text-black'
        : 'bg-orange-400 text-white';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>
      {condition}
    </span>
  );
}

export default function ItemCard({ item }: { item: ShopItem }) {
  const imageUrl =
    item.thumbnail_url || item.image_urls?.[0] || '/placeholder.png';

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Fire-and-forget tracking (non-blocking)
    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => {});
    trackWhatsAppClick();
    // Direct navigation — works best on mobile (opens WhatsApp app directly)
    window.location.href = buildWhatsAppUrl(item);
  };

  return (
    <div className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      <Link href={`/item/${item.id}`}>
        <div className="relative aspect-square bg-gray-100 overflow-hidden">
          <Image
            src={imageUrl}
            alt={item.item_name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {/* Shop badge */}
          {item.shop_source && (
            <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded">
              {item.shop_source}
            </span>
          )}
          {/* Featured star */}
          {item.is_featured && (
            <span className="absolute top-2 right-2">
              <Star size={18} className="text-yellow fill-yellow drop-shadow" />
            </span>
          )}
          {item.is_sold && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="font-heading text-2xl text-white">SOLD</span>
            </div>
          )}
        </div>
      </Link>
      <div className="p-3">
        <Link href={`/item/${item.id}`}>
          <h3 className="font-semibold text-sm line-clamp-1 hover:text-yellow transition-colors">
            {item.item_name}
          </h3>
        </Link>
        <div className="flex items-center gap-1.5 mt-1">
          {item.brand && (
            <span className="text-xs text-muted">{item.brand}</span>
          )}
          <ConditionBadge condition={item.condition} />
        </div>
        <button
          onClick={handleWhatsAppClick}
          className="w-full flex items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 text-black font-bold text-sm py-2.5 rounded-lg mt-3 active:scale-95 transition-all"
        >
          <MessageCircle size={16} />
          PRICE
        </button>
      </div>
    </div>
  );
}
