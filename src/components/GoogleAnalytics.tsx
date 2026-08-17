'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Route prefixes that must NOT load Google Analytics — internal worker/admin/ops
 * tools. Keeping GA off these routes prevents internal traffic from polluting the
 * public-site analytics. API routes render no HTML, so they never load GA anyway.
 */
const INTERNAL_ROUTE_PREFIXES = [
  '/admin',
  '/team',
  '/appliances',
  '/carpenter-tracker',
  '/diesel',
  '/login',
];

function isInternalRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return INTERNAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Env var wins if set (so Vercel can override); hardcoded fallback is the live ID.
// Resolved here (not passed as a prop) so the ID string is never serialized into
// the RSC flight payload of internal routes where the component renders null.
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-W8QXKD6JQS';

/**
 * Google Analytics 4 loader, scoped to the public marketplace only.
 * gtag.js + the config init are injected as afterInteractive scripts, and the
 * whole thing renders null on internal routes so window.gtag never exists there
 * (which in turn no-ops the GA calls in fbpixel.ts and PageViewTracker).
 */
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const gaId = GA_MEASUREMENT_ID;

  if (!gaId || isInternalRoute(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            // send_page_view is OFF on purpose: PageViewTracker is the single
            // source of pageviews. With it on, gtag fired one page_view here
            // AND PageViewTracker's mount effect fired another, double-counting
            // every real load site-wide. Do not flip this back to true without
            // deleting the gtag call in PageViewTracker.
            gtag('config', '${gaId}', { send_page_view: false });
          `,
        }}
      />
    </>
  );
}
