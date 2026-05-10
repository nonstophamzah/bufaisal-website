// Custom next/image loader. Bypasses /_next/image so we don't hit
// Vercel's image-optimization quota (Hobby tier returns HTTP 402 once
// the monthly limit is exhausted, which broke every Cloudinary thumbnail
// site-wide on 2026-05-09).
//
// For Cloudinary URLs we inject Cloudinary's own transformation params
// (f_auto = pick best format per browser; q_auto or q_<n> = quality;
// w_<n> = width; c_limit = downscale only, never upscale). Cloudinary's
// CDN serves the result for free at our volume.
//
// For non-Cloudinary URLs (Unsplash category images, etc.) we return
// the URL unchanged. The browser scales it client-side. We lose
// Vercel's responsive resizing for those, but the alternative — keep
// going through /_next/image — was already 402'ing.
//
// next.config.mjs sets `images.loader = 'custom'` and points at this
// file via `loaderFile`. When custom is set, next/image skips
// /_next/image entirely and renders <img src> with whatever this
// returns.

interface LoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

const CLOUDINARY_HOST = 'https://res.cloudinary.com/';
const UPLOAD_SEGMENT = '/image/upload/';

export default function cloudinaryLoader({ src, width, quality }: LoaderArgs): string {
  // Local public-folder URLs (e.g. /og-image.png) — pass through.
  if (src.startsWith('/')) return src;

  // Cloudinary URL — inject transformations into the path. Format:
  //   https://res.cloudinary.com/<cloud>/image/upload/<transforms>/v<ver>/<file>
  if (src.startsWith(CLOUDINARY_HOST) && src.includes(UPLOAD_SEGMENT)) {
    const q = clampQuality(quality);
    // c_limit prevents Cloudinary from upscaling small originals when
    // we ask for a width larger than the source. f_auto picks AVIF /
    // WebP / JPEG per Accept-header.
    const transform = `f_auto,q_${q},w_${width},c_limit`;
    return src.replace(UPLOAD_SEGMENT, `${UPLOAD_SEGMENT}${transform}/`);
  }

  // Anything else (Unsplash, Supabase storage, etc.) — return as-is.
  // We could add hooks for those CDNs here later if size matters.
  return src;
}

function clampQuality(q: number | undefined): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 75;
  if (q < 1) return 1;
  if (q > 100) return 100;
  return Math.round(q);
}
