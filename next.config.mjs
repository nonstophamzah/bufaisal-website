/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 4: ensure the listing-generator prompt is bundled with the API
  // function. fs.readFileSync(process.cwd(), 'lib/prompts/...') is invisible
  // to Next.js's file tracer, so we add an explicit hint or Vercel ships the
  // function without the .md file and reads blow up at runtime.
  experimental: {
    outputFileTracingIncludes: {
      '/api/items/[id]/generate-listing': ['./lib/prompts/listing-generator-v1.md'],
    },
  },
  images: {
    // Custom loader bypasses /_next/image entirely so we don't hit
    // Vercel's image-optimization quota (Hobby tier returns HTTP 402
    // once the monthly limit is exhausted, which broke every Cloudinary
    // thumbnail site-wide on 2026-05-09). The loader injects Cloudinary
    // transformations directly into res.cloudinary.com URLs, which
    // Cloudinary serves from its own CDN for free at our volume.
    // remotePatterns is kept for next dev validation and any leftover
    // <Image> calls that bypass our loader.
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async redirects() {
    return [];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Microsoft Clarity needs three directives, not one: the tag
              // itself from www.clarity.ms (script-src), the session-data
              // ingest to the region-sharded collect endpoint (connect-src
              // https://*.clarity.ms), and the Bing ID-sync pixel (img-src
              // c.bing.com). Clarity shipped in 6977ba7 mirroring
              // GoogleAnalytics.tsx, but GA's domains were already allowlisted
              // here and Clarity's never were — so the tag was injected into
              // the DOM on every public page and then silently refused by CSP,
              // which is why the dashboard recorded zero sessions.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.facebook.com https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms",
              // Phase 2 fix: browser-image-compression spawns an inline blob:
              // worker on /team. Without an explicit worker-src, browsers
              // fall back through child-src to script-src, which doesn't
              // include blob:, and the worker creation gets blocked with a
              // CSP SecurityError. The library then falls back to main-thread
              // compression on iPhone — slow enough that Phase 2 looked
              // broken in production. Allowing 'self' + blob: here is the
              // minimum needed; the worker only ever importScripts our own
              // /browser-image-compression.js (self-hosted, see public/).
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co https://*.supabase.in https://images.unsplash.com https://www.facebook.com https://www.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com https://c.bing.com",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.cloudinary.com https://www.google-analytics.com https://www.facebook.com https://sheets.googleapis.com https://*.clarity.ms",
              "frame-src 'self' https://www.google.com https://maps.google.com",
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
