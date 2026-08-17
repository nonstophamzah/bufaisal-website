'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/fbpixel';

/**
 * The SINGLE source of truth for pageview events on both GA4 and Meta.
 *
 * Neither platform fires its own pageview any more: the GA4 config sets
 * `send_page_view: false` and the Meta bootstrap in layout.tsx only calls
 * `fbq('init')`. Both used to fire one here AND one at script level, so every
 * real page load was counted twice on both platforms — visible on 2026-08-16
 * as /item/* at 2.42 views/user and /categories at 3.15 against roughly 1.2
 * and 1.6 real loads. If you re-add a script-level PageView, delete this
 * component — never run both.
 *
 * Keyed on the SEMANTIC view (pathname + category + q), never on the raw
 * searchParams object. Two params are deliberately excluded:
 *
 *  - `page` is infinite-scroll depth, not a new page. The feed's loadMore does
 *    router.replace('?page=N') on every scroll step, which changes the
 *    searchParams identity and fired a pageview each time — the bulk of the
 *    inflation (GA4 2026-08-16: / at 10.49 views/user, /shop at 13.07, against
 *    ~2.4 on the non-scrolling routes). Meta was optimising delivery against
 *    roughly 4x the real traffic.
 *  - `redirectedFrom` is a display-only label for the "Showing X for 'term'"
 *    banner; dismissing it does a router.replace and must not count as a view.
 *
 * Note that keying on the raw object is not fixable by switching to
 * history.replaceState — Next intercepts it and syncs useSearchParams(), so
 * the effect fires either way. Verified 2026-08-17: a bare replaceState with
 * no router involvement produced 1 gtag page_view + 1 fbq PageView.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get('category') ?? '';
  const q = searchParams.get('q') ?? '';

  useEffect(() => {
    trackPageView();

    if (typeof window !== 'undefined' && window.gtag) {
      // Report only the semantic params, so GA4 doesn't split one logical view
      // into a separate page entry per scroll step.
      const semantic = new URLSearchParams();
      if (category) semantic.set('category', category);
      if (q) semantic.set('q', q);

      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_search: semantic.toString(),
      });
    }
  }, [pathname, category, q]);

  return null;
}
