import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FEED_COLUMNS,
  FEED_ROW_CAP,
  FEED_ROW_CAP_ALERT_AT,
  checkFeedRowCap,
} from '@/lib/feed-query';

describe('FEED_COLUMNS', () => {
  const cols = FEED_COLUMNS.split(',');

  it('is a comma-joined list with no whitespace or empty entries', () => {
    expect(FEED_COLUMNS).not.toMatch(/\s/);
    expect(cols.every((c) => c.length > 0)).toBe(true);
  });

  it('has no duplicates', () => {
    expect(new Set(cols).size).toBe(cols.length);
  });

  // Each of these is read by a feed surface that would fail SILENTLY if the
  // column were dropped — the value would be undefined, not an error.
  it.each([
    ['ai_barcode_extracted', 'buildWhatsAppUrl 🔖 line of the Negotiate pre-fill'],
    ['worker_shop_id', 'shop badge + WhatsApp location line'],
    ['admin_price_aed', 'getEffectivePrice precedence'],
    ['worker_price_aed', 'getEffectivePrice precedence'],
    ['sale_price', 'getEffectivePrice fallback'],
    ['admin_negotiable', 'Negotiable chip + WhatsApp opener wording'],
    ['worker_negotiable', 'Negotiable chip + WhatsApp opener wording'],
    ['published_item_name', 'resolvePublicItemFields itemName'],
    ['item_name', 'resolvePublicItemFields legacy fallback'],
    ['published_description', 'ItemList JSON-LD description'],
    ['published_brand', 'ItemList JSON-LD brand'],
    ['published_category', 'homepage interleave buckets'],
    ['is_featured', 'interleave pins featured first'],
    ['created_at', 'interleave freshness + Just Arrived badge'],
    ['thumbnail_url', 'getItemImageUrl fallback chain'],
    ['image_urls', 'getItemImageUrl fallback chain'],
    ['worker_photo_brand_url', 'getItemImageUrl fallback chain'],
  ])('includes %s (%s)', (col) => {
    expect(cols).toContain(col);
  });

  // The whole point of the lean select: these are the payload hogs and are
  // read only by /item/[id].
  it.each([
    'published_product_schema',
    'published_faq_schema',
    'published_spec_table',
    'published_faqs',
    'published_trust_signals',
    'condition_notes',
  ])('excludes %s', (col) => {
    expect(cols).not.toContain(col);
  });
});

describe('checkFeedRowCap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays silent below the alert threshold', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkFeedRowCap(FEED_ROW_CAP_ALERT_AT - 1, 'GET /');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires at the threshold, and loudly — console.error, with count and route', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkFeedRowCap(FEED_ROW_CAP_ALERT_AT, 'GET / (homepage interleave)');
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0][0]);
    expect(msg).toContain(String(FEED_ROW_CAP_ALERT_AT));
    expect(msg).toContain('GET / (homepage interleave)');
    expect(msg).toContain(String(FEED_ROW_CAP));
  });

  it('fires at the hard cap, where truncation is already happening', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkFeedRowCap(FEED_ROW_CAP, 'GET /shop?category=Appliances');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('GET /shop?category=Appliances');
  });
});
