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
 * The Clarity tag is injected as a lazyOnload script (fires after the page is
 * idle, never blocking load) and the whole thing renders null on internal routes
 * so no session recording runs on admin/worker/ops tools.
 */
export default function MicrosoftClarity() {
  const pathname = usePathname();
  const clarityId = CLARITY_PROJECT_ID;

  if (!clarityId || isInternalRoute(pathname)) return null;

  return (
    <Script
      id="ms-clarity"
      src={`https://www.clarity.ms/tag/${clarityId}`}
      strategy="lazyOnload"
    />
  );
}
