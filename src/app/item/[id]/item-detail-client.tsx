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
  Truck,
  Check,
  Expand,
} from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ShopItem } from '@/lib/supabase';
import { buildWhatsAppUrl, getCategoryDisplayName } from '@/lib/constants';
import { trackWhatsAppClick, trackViewContent } from '@/lib/fbpixel';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';
import { getShop } from '@/lib/shops';
import { getItemImageUrl } from '@/lib/item-image';
import { getEffectivePrice } from '@/lib/effective-fields';
import cloudinaryLoader from '@/lib/cloudinary-loader';

// Higher-res, still-optimized variant for the fullscreen lightbox. The
// lightbox renders its own <img> outside next/image, so it would
// otherwise load the raw original. Reuse the Cloudinary loader to inject
// f_auto,q_90,w_1600,c_limit (non-Cloudinary URLs pass through unchanged).
function hiResUrl(url: string): string {
  return cloudinaryLoader({ src: url, width: 1600, quality: 90 });
}

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

// Dedupe + cap trust signals for display. The admin whitelist stores
// "…UAE's largest used goods market" with a curly apostrophe (U+2019)
// while the AI emits the same phrase with a straight apostrophe, so the
// admin-side Set never collapses them and both land in
// published_trust_signals. Normalize apostrophes / dashes / whitespace /
// case for the dedup key (keep the first-seen original text), then cap.
function dedupeTrustSignals(
  signals: string[] | null | undefined,
  cap = 5
): string[] {
  if (!signals) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of signals) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim();
    if (!text) continue;
    const key = text
      .toLowerCase()
      .replace(/[‘’′`']/g, "'") // curly/straight apostrophes
      .replace(/[–—]/g, '-') // en/em dash → hyphen
      .replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
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
  const price = getEffectivePrice(item);
  const hasPrice = !!price && price > 0;
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
            {hasPrice ? `AED ${price}` : 'Ask Price'}
          </span>
          {hasPrice &&
            ((item.admin_negotiable ?? item.worker_negotiable) === false ? (
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
  // Fullscreen lightbox. `source` picks which array to page through:
  // 'main' = the hero gallery (`images`), 'grid' = the Photos grid
  // (`galleryPhotos`). Kept as one nullable object so a single <Lightbox>
  // serves both entry points without duplicating the overlay.
  const [lightbox, setLightbox] = useState<{
    source: 'main' | 'grid';
    index: number;
  } | null>(null);
  const f = resolvePublicItemFields(item);
  const shop = getShop(item.worker_shop_id);
  const conditionGrade =
    item.admin_condition_grade ?? item.worker_condition_grade;
  const effectivePrice = getEffectivePrice(item);
  const hasPrice = !!effectivePrice && effectivePrice > 0;
  const trustSignals = dedupeTrustSignals(f.trustSignals);

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

  // Lightbox slides. 'main' pages through the hero gallery (`images`),
  // 'grid' through the Photos grid (`galleryPhotos`). A higher-res
  // Cloudinary variant is loaded here (the lightbox renders its own <img>
  // outside next/image). When there's a single photo we hide the arrows
  // and make the carousel finite so there's no functional-looking (but
  // no-op) navigation.
  const lightboxPhotos = lightbox?.source === 'grid' ? galleryPhotos : images;
  const lightboxSlides = lightboxPhotos.map((url, i) => ({
    src: hiResUrl(url),
    alt:
      lightbox?.source === 'grid'
        ? altTextFor(i)
        : f.itemName ?? `Product photo ${i + 1}`,
  }));
  const lightboxSingle = lightboxSlides.length <= 1;

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

        {/* Desktop (lg+): Noon-style buy-box grid — gallery top-left,
            sticky buy box top-right, long content bottom-left. Mobile &
            tablet: single-column stack in source order (gallery → buy
            box → details), byte-identical to the prior layout. Vertical
            gaps come from wrapper margins (grid gap is x-only) so the
            single-column rhythm matches production exactly. */}
        <div className="grid lg:grid-cols-2 gap-x-8 lg:gap-x-12">
          {/* Photo gallery */}
          <div className="mb-8 lg:mb-6 lg:col-start-1 lg:row-start-1">
            <div className="relative aspect-square lg:aspect-auto lg:h-[540px] bg-gray-50 rounded-xl overflow-hidden">
              {images.length > 0 ? (
                <Image
                  src={images[activeImage]}
                  alt={f.itemName ?? 'Product image'}
                  fill
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setLightbox({ source: 'main', index: activeImage })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setLightbox({ source: 'main', index: activeImage });
                    }
                  }}
                  aria-label="Open full-screen photo viewer"
                  className="object-contain cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-yellow"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted">
                  No Image
                </div>
              )}
              {/* Tap/zoom affordance — signals the image enlarges. Non-
                  interactive (pointer-events-none) so the tap falls through
                  to the image's own click handler. Hidden when there's no
                  image. */}
              {images.length > 0 && !item.is_sold && (
                <div className="absolute bottom-3 right-3 pointer-events-none bg-black/45 text-white rounded-full p-2">
                  <Expand size={18} aria-hidden="true" />
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

          {/* Buy box — sticky decision column on desktop. On mobile &
              tablet this stacks in source order right after the gallery,
              exactly as before. The inline Negotiate button + delivery
              line are md+ only (hidden md:flex), so mobile is unchanged:
              it still uses the sticky bottom bar. */}
          <div className="mb-6 lg:mb-0 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24 lg:self-start">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-medium text-yellow bg-yellow/10 px-2 py-1 rounded">
                {getCategoryDisplayName(f.category)}
              </span>
              <ConditionBadge condition={conditionGrade} />
            </div>
            <h1 className="font-heading text-3xl md:text-4xl mb-1">
              {f.itemName}
            </h1>
            {f.brand && (
              <p className="text-muted text-sm mb-2">{f.brand}</p>
            )}

            <div className="flex items-center gap-2 mb-4">
              <span className="font-heading text-2xl">
                {hasPrice ? `AED ${effectivePrice}` : 'Ask Price'}
              </span>
              {hasPrice && (
                (item.admin_negotiable ?? item.worker_negotiable) === false ? (
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

            {/* Desktop/tablet Negotiate CTA — moved directly under the
                price so it sits above the fold. Same handler + prefilled
                WhatsApp body as before. Mobile keeps the sticky bottom
                bar (this is hidden on mobile). */}
            <button
              onClick={handleWhatsAppClick}
              disabled={item.is_sold}
              className="hidden md:flex w-full items-center justify-center gap-2 bg-yellow hover:bg-yellow/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl text-lg transition-colors active:scale-[0.98] mb-3"
            >
              <MessageCircle size={22} />
              {item.is_sold ? 'Item Sold' : 'NEGOTIATE'}
            </button>

            {/* Delivery promise — md+ only, directly under the button */}
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-700 mb-4">
              <Truck size={18} className="text-black flex-shrink-0" />
              <span>Delivery in all 7 emirates · 24-48hr</span>
            </div>

            {/* Trust signals — mobile keeps the exact bullet list (deduped);
                md+ shows a compact icon block, max 5. */}
            {trustSignals.length > 0 && (
              <>
                <ul className="md:hidden space-y-1.5 text-sm text-gray-700">
                  {trustSignals.map((sig, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow font-bold leading-5">•</span>
                      <span className="leading-5">{sig}</span>
                    </li>
                  ))}
                </ul>
                <ul className="hidden md:flex md:flex-col gap-1.5">
                  {trustSignals.map((sig, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <Check
                        size={16}
                        className="text-green-600 mt-0.5 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span className="leading-5">{sig}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Long-form content — bottom-left on desktop, under the gallery,
              so the sticky buy box has height to stick against. On mobile
              & tablet this stacks below the buy box in the same order as
              before. */}
          <div className="lg:col-start-1 lg:row-start-2">
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
                      onClick={() => setLightbox({ source: 'grid', index: i })}
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
                {shop?.displayName && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-muted">Shop</span>
                    <p className="font-medium">{shop.displayName}</p>
                  </div>
                )}
                {conditionGrade && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-muted">Condition</span>
                    <p className="font-medium">{conditionGrade}</p>
                  </div>
                )}
                {item.ai_barcode_extracted && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-muted">Barcode</span>
                    <p className="font-medium">{item.ai_barcode_extracted}</p>
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
        open={lightbox !== null}
        index={lightbox?.index ?? 0}
        close={() => setLightbox(null)}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 3, doubleTapDelay: 300 }}
        controller={{ closeOnBackdropClick: true }}
        carousel={{ finite: lightboxSingle }}
        render={
          lightboxSingle
            ? { buttonPrev: () => null, buttonNext: () => null }
            : undefined
        }
        slides={lightboxSlides}
      />
    </div>
  );
}
