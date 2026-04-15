'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, Star, Clock } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl } from '@/lib/constants';
import { trackWhatsAppClick } from '@/lib/fbpixel';

function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) return null;
  const map: Record<string, { cls: string; label: string }> = {
    Excellent: { cls: 'bg-green-500 text-white', label: 'Excellent Condition' },
    Good: { cls: 'bg-blue-500 text-white', label: 'Good Condition' },
    Fair: { cls: 'bg-gray-400 text-white', label: 'Fair — Minor Wear' },
    'Brand New': {
      cls: 'bg-gradient-to-r from-yellow to-amber-500 text-black',
      label: 'Brand New — Made by Bu Faisal',
    },
  };
  const badge = map[condition];
  if (!badge) return null;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function isJustArrived(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000; // 7 days
}

export default function ItemCard({ item }: { item: ShopItem }) {
  const imageUrl =
    item.thumbnail_url || item.image_urls?.[0] || '/placeholder.png';
  const justArrived = isJustArrived(item.created_at);

  const handleWhatsAppClick = (e: React.MouseEvent) => {
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
          {/* Just Arrived badge */}
          {justArrived && (
            <span className="absolute top-2 left-2 bg-yellow text-black text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <Clock size={10} />
              Just Arrived
            </span>
          )}
          {/* Shop badge — show only if not overlapping with Just Arrived */}
          {!justArrived && item.shop_source && (
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
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {item.brand && (
            <span className="text-xs text-muted">{item.brand}</span>
          )}
          <ConditionBadge condition={item.condition} />
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="font-bold text-sm">
            {item.sale_price ? `${item.sale_price} AED` : 'Ask for price'}
          </span>
          {!!item.sale_price && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F9D923', color: '#111' }}>
              Negotiable
            </span>
          )}
        </div>
        <button
          onClick={handleWhatsAppClick}
          className="w-full flex items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 text-black font-bold text-sm py-2.5 rounded-lg mt-2 active:scale-95 transition-all"
        >
          <MessageCircle size={16} />
          WHATSAPP
        </button>
      </div>
    </div>
  );
}
