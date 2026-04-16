declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// ── Facebook Pixel Events ──

/** Fire PageView — call on route changes for SPA navigation */
export function trackPageView() {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
  }
  // GA4 page_view is automatic via gtag config
}

/** ViewContent — fire on product detail page view */
export function trackViewContent(item: {
  id: string;
  item_name: string;
  category?: string;
  sale_price?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_type: 'product',
      content_ids: [item.id],
      content_name: item.item_name,
      content_category: item.category || '',
      value: item.sale_price || 0,
      currency: 'AED',
    });
  }
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'view_item', {
      items: [{
        item_id: item.id,
        item_name: item.item_name,
        item_category: item.category || '',
        price: item.sale_price || 0,
        currency: 'AED',
      }],
    });
  }
}

/** Lead — fire when user clicks WhatsApp on an item (item-specific) */
export function trackWhatsAppClick(item?: {
  id: string;
  item_name: string;
  sale_price?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: item?.item_name || 'General Inquiry',
      content_category: 'WhatsApp',
      value: item?.sale_price || 0,
      currency: 'AED',
      ...(item && { content_ids: [item.id] }),
    });
  }
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'generate_lead', {
      currency: 'AED',
      value: item?.sale_price || 0,
      ...(item && { item_id: item.id }),
    });
  }
}

/** Contact — fire on general WhatsApp clicks (not item-specific) */
export function trackContactClick() {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Contact', {
      content_category: 'WhatsApp',
    });
  }
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'contact', {
      method: 'WhatsApp',
    });
  }
}

/** Search — fire when user searches */
export function trackSearch(searchString: string) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Search', {
      search_string: searchString,
    });
  }
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'search', {
      search_term: searchString,
    });
  }
}
