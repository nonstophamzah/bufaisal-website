'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl } from '@/lib/constants';
import { trackWhatsAppClick, trackViewContent } from '@/lib/fbpixel';

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
    <span className={`text-xs font-bold px-2 py-1 rounded ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

export default function ItemDetailClient({ item }: { item: ShopItem }) {
  const [activeImage, setActiveImage] = useState(0);

  // Track ViewContent on mount
  useEffect(() => {
    trackViewContent({
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      sale_price: item.sale_price,
    });
  }, [item.id, item.item_name, item.category, item.sale_price]);

  const handleWhatsAppClick = () => {
    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => {});
    trackWhatsAppClick({ id: item.id, item_name: item.item_name, sale_price: item.sale_price });
    window.location.href = buildWhatsAppUrl(item);
  };

  const images =
    item.image_urls?.length > 0
      ? item.image_urls
      : item.thumbnail_url
        ? [item.thumbnail_url]
        : [];

  return (
    <div className="pt-20 pb-28 md:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back */}
        <Link
          href="/shop"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-black mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Photo gallery */}
          <div>
            <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden">
              {images.length > 0 ? (
                <Image
                  src={images[activeImage]}
                  alt={item.item_name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted">
                  No Image
                </div>
              )}
              {item.is_sold && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="font-heading text-4xl text-white">
                    SOLD
                  </span>
                </div>
              )}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setActiveImage(
                        (activeImage - 1 + images.length) % images.length
                      )
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() =>
                      setActiveImage((activeImage + 1) % images.length)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto hide-scrollbar">
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      i === activeImage
                        ? 'border-yellow'
                        : 'border-transparent'
                    }`}
                  >
                    <Image
                      src={url}
                      alt={`${item.item_name} ${i + 1}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-medium text-yellow bg-yellow/10 px-2 py-1 rounded">
                {item.category}
              </span>
              <ConditionBadge condition={item.condition} />
            </div>
            <h1 className="font-heading text-3xl md:text-4xl mb-1">
              {item.item_name}
            </h1>
            {item.brand && (
              <p className="text-muted text-sm mb-2">{item.brand}</p>
            )}

            <div className="flex items-center gap-2 mb-4">
              <span className="font-heading text-2xl">
                {item.sale_price ? `${item.sale_price} AED` : 'Ask for price'}
              </span>
              {!!item.sale_price && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F9D923', color: '#111' }}>
                  Negotiable
                </span>
              )}
            </div>

            {item.description && (
              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            )}

            {item.condition_notes && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <h3 className="font-semibold text-sm mb-1 text-amber-800">Condition Notes</h3>
                <p className="text-sm text-amber-700">{item.condition_notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              {item.shop_source && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-muted">Shop</span>
                  <p className="font-medium">{item.shop_source}</p>
                </div>
              )}
              {item.condition && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-muted">Condition</span>
                  <p className="font-medium">{item.condition}</p>
                </div>
              )}
              {item.barcode && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-muted">Barcode</span>
                  <p className="font-medium">{item.barcode}</p>
                </div>
              )}
              {item.product_type && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-muted">Type</span>
                  <p className="font-medium">{item.product_type}</p>
                </div>
              )}
            </div>

            {/* Desktop WhatsApp CTA */}
            <button
              onClick={handleWhatsAppClick}
              disabled={item.is_sold}
              className="hidden md:flex w-full items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl text-lg transition-colors active:scale-[0.98]"
            >
              <MessageCircle size={22} />
              {item.is_sold ? 'Item Sold' : 'WHATSAPP'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sticky WhatsApp CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 md:hidden z-40">
        <button
          onClick={handleWhatsAppClick}
          disabled={item.is_sold}
          className="w-full flex items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl text-lg transition-colors active:scale-[0.98]"
        >
          <MessageCircle size={22} />
          {item.is_sold ? 'Item Sold' : 'WHATSAPP'}
        </button>
      </div>

      {/* Sticky WhatsApp circle button — bottom right */}
      {!item.is_sold && (
        <a
          href={`https://wa.me/971585932499?text=${encodeURIComponent(
            `Hi, I'm interested in *${item.item_name}*${item.barcode ? ` (Barcode: ${item.barcode})` : ''}. Is this still available?\nhttps://bufaisal.ae/item/${item.id}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            fetch('/api/track-click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId: item.id }),
            }).catch(() => {});
            trackWhatsAppClick({ id: item.id, item_name: item.item_name, sale_price: item.sale_price });
          }}
          className="fixed bottom-20 md:bottom-6 right-4 z-50 w-14 h-14 bg-yellow hover:bg-yellow/90 rounded-full flex items-center justify-center shadow-lg transition-colors"
          aria-label="WhatsApp"
        >
          <MessageCircle size={28} className="text-black" />
        </a>
      )}
    </div>
  );
}
