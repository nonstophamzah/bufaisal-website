'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  MessageCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl } from '@/lib/constants';
import { trackWhatsAppClick, trackViewContent } from '@/lib/fbpixel';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';
import { getShop } from '@/lib/shops';
import { getItemImageUrl } from '@/lib/item-image';

// Spec table canonical order. Keys not in this list fall to the end in
// insertion order. Matches Phase 6.4 PR A scope.
const CANONICAL_SPEC_KEYS = [
  'Brand',
  'Condition',
  'Item Type',
  'Capacity',
  'Configuration',
  'Color',
  'Location',
  'Delivery',
] as const;

function orderSpecRows(table: Record<string, string>): Array<[string, string]> {
  const seen = new Set<string>();
  const ordered: Array<[string, string]> = [];
  for (const key of CANONICAL_SPEC_KEYS) {
    if (table[key] !== undefined) {
      ordered.push([key, String(table[key])]);
      seen.add(key);
    }
  }
  for (const [k, v] of Object.entries(table)) {
    if (!seen.has(k)) ordered.push([k, String(v)]);
  }
  return ordered;
}

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

// Quieter card for the Similar items grid below /item/[id]. Purely
// navigational — entire card is one <Link>, no per-card CTA buttons.
// Co-located here (not promoted to /components) because it's only used
// in this section; the shared ItemCard still owns homepage/shop feed.
function SimilarItemCard({ item }: { item: ShopItem }) {
  const f = resolvePublicItemFields(item);
  const imageUrl = getItemImageUrl(item);
  return (
    <Link
      href={`/item/${item.id}`}
      className="group flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all"
    >
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        <Image
          src={imageUrl}
          alt={f.itemName ?? 'Product image'}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {item.is_sold && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="font-heading text-2xl text-white">SOLD</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-yellow transition-colors">
          {f.itemName}
        </h3>
        {f.brand && (
          <p className="text-xs text-muted mt-0.5">{f.brand}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="font-bold text-sm">
            {item.sale_price ? `AED ${item.sale_price}` : 'Ask Price'}
          </span>
          {!!item.sale_price &&
            (item.negotiable === false ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                Starting Price
              </span>
            ) : (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow text-black">
                Negotiable
              </span>
            ))}
        </div>
      </div>
    </Link>
  );
}

interface ItemDetailClientProps {
  item: ShopItem;
  similarItems: ShopItem[];
}

export default function ItemDetailClient({
  item,
  similarItems,
}: ItemDetailClientProps) {
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const f = resolvePublicItemFields(item);
  const shop = getShop(item.worker_shop_id);

  // Gallery photo grid sources the four canonical worker_photo_* columns
  // (positionally aligned with published_image_alt_texts). Falls back to
  // the legacy gallery chain when worker_* are all null.
  const galleryPhotos: string[] = [
    item.worker_photo_brand_url,
    item.worker_photo_2_url,
    item.worker_photo_3_url,
    item.worker_photo_barcode_url,
  ].filter((u): u is string => typeof u === 'string' && u.length > 0);

  const altTextFor = (i: number): string =>
    item.published_image_alt_texts?.[i] ?? `Product photo ${i + 1}`;

  // Track ViewContent on mount. Analytics is non-display and stays on
  // legacy fields per Phase 6.3 scope (separate consumer decision).
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

  // Gallery fallback chain matches src/lib/item-image.ts:
  // legacy image_urls > legacy thumbnail_url > Phase 1B worker_photo_brand_url.
  const images =
    item.image_urls?.length > 0
      ? item.image_urls
      : item.thumbnail_url
        ? [item.thumbnail_url]
        : item.worker_photo_brand_url
          ? [item.worker_photo_brand_url]
          : [];

  return (
    <div className="pt-24 pb-28 md:pb-16">
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
                  alt={f.itemName ?? 'Product image'}
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
                      alt={`${f.itemName ?? 'Product image'} ${i + 1}`}
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
                {f.category}
              </span>
              <ConditionBadge condition={item.condition} />
            </div>
            <h1 className="font-heading text-3xl md:text-4xl mb-1">
              {f.itemName}
            </h1>
            {f.brand && (
              <p className="text-muted text-sm mb-2">{f.brand}</p>
            )}

            <div className="flex items-center gap-2 mb-4">
              <span className="font-heading text-2xl">
                {item.sale_price ? `AED ${item.sale_price}` : 'Ask Price'}
              </span>
              {!!item.sale_price && (
                item.negotiable === false ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                    Starting Price
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow text-black">
                    Negotiable
                  </span>
                )
              )}
            </div>

            {f.trustSignals && f.trustSignals.length > 0 && (
              <ul className="mb-6 space-y-1.5 text-sm text-gray-700">
                {f.trustSignals.map((sig, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-yellow font-bold leading-5">•</span>
                    <span className="leading-5">{sig}</span>
                  </li>
                ))}
              </ul>
            )}

            {f.description && (
              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {f.description}
                </p>
              </div>
            )}

            {item.condition_notes && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <h3 className="font-semibold text-sm mb-1 text-amber-800">Condition Notes</h3>
                <p className="text-sm text-amber-700">{item.condition_notes}</p>
              </div>
            )}

            {f.specTable && Object.keys(f.specTable).length > 0 && (
              <section className="mb-6">
                <h2 className="font-semibold text-sm mb-2">Specifications</h2>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody>
                    {orderSpecRows(f.specTable).map(([k, v], i) => {
                      const linkable = k === 'Location' && shop && shop.mapUrl;
                      return (
                        <tr
                          key={k}
                          className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                        >
                          <th
                            scope="row"
                            className="text-left font-medium text-gray-600 px-3 py-2 align-top w-2/5"
                          >
                            {k}
                          </th>
                          <td className="text-gray-900 px-3 py-2 align-top">
                            {linkable ? (
                              <a
                                href={shop!.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                {shop!.displayName}
                                <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : (
                              v
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            {galleryPhotos.length >= 2 && (
              <section className="mb-6">
                <h2 className="font-semibold text-sm mb-2">Photos</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {galleryPhotos.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow"
                      aria-label={`Open photo ${i + 1}`}
                    >
                      <Image
                        src={url}
                        alt={altTextFor(i)}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {f.faqs && f.faqs.length > 0 && (
              <section className="mb-6">
                <h2 className="font-semibold text-sm mb-2">FAQ</h2>
                <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200">
                  {f.faqs.map((faq, i) => (
                    <details
                      key={i}
                      className="group bg-white open:bg-gray-50"
                    >
                      <summary className="flex items-center justify-between gap-3 px-3 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-gray-50 transition-colors">
                        <span className="text-sm font-medium text-gray-900">
                          {faq.question}
                        </span>
                        <ChevronDown
                          size={18}
                          className="flex-shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>
                      <div className="px-3 pb-3 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                        {faq.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {(!f.specTable || Object.keys(f.specTable).length === 0) && (
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
                {f.productType && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-muted">Type</span>
                    <p className="font-medium">{f.productType}</p>
                  </div>
                )}
              </div>
            )}

            {/* Desktop Negotiate CTA — text per Architecture doc 2.1
                ("every product CTA is Negotiate"). Same href + prefilled
                message body as before via buildWhatsAppUrl(). */}
            <button
              onClick={handleWhatsAppClick}
              disabled={item.is_sold}
              className="hidden md:flex w-full items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl text-lg transition-colors active:scale-[0.98]"
            >
              <MessageCircle size={22} />
              {item.is_sold ? 'Item Sold' : 'NEGOTIATE'}
            </button>
          </div>
        </div>

        {similarItems.length > 0 && (
          <section className="mt-12">
            <h2 className="font-heading text-2xl mb-4">Similar items</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {similarItems.map((sim) => (
                <SimilarItemCard key={sim.id} item={sim} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky Negotiate CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 md:hidden z-40">
        <button
          onClick={handleWhatsAppClick}
          disabled={item.is_sold}
          className="w-full flex items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl text-lg transition-colors active:scale-[0.98]"
        >
          <MessageCircle size={22} />
          {item.is_sold ? 'Item Sold' : 'NEGOTIATE'}
        </button>
      </div>

      {/* Sticky WhatsApp circle button — bottom right */}
      {!item.is_sold && (
        <a
          href={buildWhatsAppUrl(item)}
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

      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={galleryPhotos.map((url, i) => ({
          src: url,
          alt: altTextFor(i),
        }))}
      />
    </div>
  );
}
