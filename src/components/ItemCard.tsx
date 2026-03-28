'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl } from '@/lib/constants';

export default function ItemCard({ item }: { item: ShopItem }) {
  const imageUrl =
    item.thumbnail_url || item.image_urls?.[0] || '/placeholder.png';

  const handleWhatsAppClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch('/api/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
    } catch {
      // silent fail
    }
    window.open(buildWhatsAppUrl(item), '_blank');
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
          {item.is_sold && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="font-heading text-2xl text-white">SOLD</span>
            </div>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link href={`/item/${item.id}`}>
          <h3 className="font-semibold text-sm line-clamp-1 hover:text-yellow transition-colors">
            {item.item_name}
          </h3>
        </Link>
        {item.brand && (
          <p className="text-xs text-muted mt-0.5">{item.brand}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="font-heading text-xl">
            AED {item.sale_price}
          </span>
          <button
            onClick={handleWhatsAppClick}
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <MessageCircle size={14} />
            Inquire
          </button>
        </div>
      </div>
    </div>
  );
}
