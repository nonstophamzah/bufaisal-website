'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Route prefixes that must NOT load Microsoft Clarity — internal worker/admin/ops
 * tools. Keeping Clarity off these routes prevents internal traffic from polluting
 * the public-site session recordings. API routes render no HTML, so they never
 * load Clarity anyway. Mirrors the scoping in GoogleAnalytics.tsx.
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
const CLARITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'xrxwld2ts1';

/**
 * Microsoft Clarity loader, scoped to the public marketplace only.
 * Runs as a lazyOnload script (fires after the page is idle, never blocking
 * load) and renders null on internal routes so no session recording runs on
 * admin/worker/ops tools.
 *
 * This MUST be Clarity's inline bootstrap, not a bare `src` to the tag URL.
 * The tag at /tag/<id> does not define `window.clarity` — its very first
 * statement CALLS it (`a[c]("metadata", ...)` with a=window, c="clarity"), and
 * it also reads `a[c].q` / `a[c].v` / `a[c].t`. The stub below defines that
 * function and its pending-call queue, then injects the tag itself. Loading the
 * tag without the stub throws `TypeError: a[c] is not a function` on line 1 and
 * Clarity silently never starts — the original 6977ba7 bug. There is still only
 * ONE Clarity script authored here; the stub is the loader, not an addition.
 */
export default function MicrosoftClarity() {
  const pathname = usePathname();
  const clarityId = CLARITY_PROJECT_ID;

  if (!clarityId || isInternalRoute(pathname)) return null;

  return (
    <Script id="ms-clarity" strategy="lazyOnload">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window,document,"clarity","script","${clarityId}");`}
    </Script>
  );
}
