// Single source of truth for the public site's image-source fallback
// chain. ItemCard, /shop, and /item/[id] all import from here so the
// chain doesn't drift across files.
//
// Order:
//   1. thumbnail_url       — legacy column written by /team submit
//   2. image_urls[0]       — legacy array written by /team submit
//   3. worker_photo_brand_url — Phase 1B canonical column. Always set
//                               on Phase 3+ rows; covers the rare case
//                               where the legacy mirror was wiped or
//                               never populated.
//   4. /og-image.png       — last-resort placeholder so Next/Image
//                            doesn't 404 to a missing /placeholder.png.
//
// See `src/lib/cloudinary-loader.ts` for the next/image loader that
// serves these via Cloudinary's CDN (bypassing the paywalled Vercel
// image optimizer).

import type { ShopItem } from '@/lib/supabase';

const FALLBACK_IMAGE = '/og-image.png';

type ItemImageSource = Pick<
  ShopItem,
  'thumbnail_url' | 'image_urls' | 'worker_photo_brand_url'
>;

export type AllPhotosSource = Pick<
  ShopItem,
  | 'worker_photo_brand_url'
  | 'worker_photo_2_url'
  | 'worker_photo_3_url'
  | 'worker_photo_barcode_url'
>;

/** Resolve the chain. Returns null if no source URL is present. */
export function resolveItemImageUrl(item: ItemImageSource): string | null {
  return (
    item.thumbnail_url ||
    item.image_urls?.[0] ||
    item.worker_photo_brand_url ||
    null
  );
}

/** For <img>/next-Image rendering. Guaranteed non-empty; falls back to /og-image.png. */
export function getItemImageUrl(item: ItemImageSource): string {
  return resolveItemImageUrl(item) ?? FALLBACK_IMAGE;
}

// Ordered, real-URL-only photo list for structured data (Product JSON-LD
// image[]). Sources directly from the worker_photo_* columns — image_urls[]
// is skipped because it omits the barcode photo. Order is fixed positionally
// to match how photos are sent to the AI in /api/items/[id]/generate-listing
// (brand → photo_2 → photo_3 → barcode).
export function getAllItemPhotos(item: AllPhotosSource): string[] {
  return [
    item.worker_photo_brand_url,
    item.worker_photo_2_url,
    item.worker_photo_3_url,
    item.worker_photo_barcode_url,
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);
}
