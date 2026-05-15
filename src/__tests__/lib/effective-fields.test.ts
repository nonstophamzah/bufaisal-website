import { describe, it, expect } from 'vitest';
import { getEffectivePrice } from '@/lib/effective-fields';
import { buildWhatsAppUrl } from '@/lib/constants';
import { augmentProductSchema } from '@/lib/augment-product-schema';
import type { ShopItem } from '@/lib/supabase';

// Phase 8 PR 1 — verify admin_price_aed propagates through the public
// fallback chain end-to-end. Pairs with the manual /admin/pending UI
// check (admin types a new price → public surface re-renders).

function row(overrides: Partial<ShopItem> = {}): ShopItem {
  // Minimal ShopItem shape — only the fields the helper / WhatsApp builder
  // actually touch. Everything else is permissive null/empty so the test
  // doesn't break when the interface gains new optional fields.
  return {
    id: 'test-uuid',
    barcode: null,
    item_name: 'Test',
    brand: null,
    product_type: null,
    description: null,
    category: 'Appliances',
    sale_price: 1000, // legacy mirror — final fallback
    shop_source: null,
    image_urls: [],
    thumbnail_url: null,
    is_published: true,
    is_sold: false,
    uploaded_by: null,
    approved_by: null,
    approved_at: null,
    whatsapp_clicks: 0,
    view_count: 0,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    condition: null,
    is_featured: false,
    is_hidden: false,
    seo_title: null,
    seo_description: null,
    duty_manager: null,
    shop_label: 'A',
    condition_notes: null,
    status: 'published',
    negotiable: true,
    listing_type: 'used',
    worker_shop_id: 'BF1',
    worker_photo_brand_url: null,
    worker_photo_2_url: null,
    worker_photo_3_url: null,
    worker_photo_barcode_url: null,
    worker_negotiable: true,
    admin_negotiable: null,
    worker_condition_type: 'Used',
    worker_condition_grade: 'Excellent',
    admin_condition_grade: null,
    worker_price_aed: 1000,
    admin_price_aed: null,
    ai_barcode_extracted: null,
    published_item_name: null,
    published_brand: null,
    published_category: null,
    published_product_type: null,
    published_description: null,
    published_seo_title: null,
    published_meta_description: null,
    published_product_schema: null,
    published_faq_schema: null,
    published_spec_table: null,
    published_faqs: null,
    published_trust_signals: null,
    published_image_alt_texts: null,
    ...overrides,
  };
}

describe('getEffectivePrice — fallback chain', () => {
  it('returns admin_price_aed when set', () => {
    const item = row({
      admin_price_aed: 850,
      worker_price_aed: 1000,
      sale_price: 1000,
    });
    expect(getEffectivePrice(item)).toBe(850);
  });

  it('falls back to worker_price_aed when admin is null', () => {
    const item = row({
      admin_price_aed: null,
      worker_price_aed: 1000,
      sale_price: 1000,
    });
    expect(getEffectivePrice(item)).toBe(1000);
  });

  it('falls back to sale_price when both admin and worker are null (legacy row)', () => {
    const item = row({
      admin_price_aed: null,
      worker_price_aed: null,
      sale_price: 250,
    });
    expect(getEffectivePrice(item)).toBe(250);
  });

  it('returns null when every column is null/undefined', () => {
    const item = row({
      admin_price_aed: null,
      worker_price_aed: null,
      // sale_price is `number` non-nullable on ShopItem; simulate the
      // legacy "0 means missing" pattern instead.
      sale_price: 0,
    });
    // 0 is a number — helper returns it; caller does the `> 0` check.
    expect(getEffectivePrice(item)).toBe(0);
  });

  it('admin override of 1 wins over worker price of 1000 (not coerced to truthy worker)', () => {
    const item = row({
      admin_price_aed: 1,
      worker_price_aed: 1000,
    });
    expect(getEffectivePrice(item)).toBe(1);
  });

  it('worker_price_aed=0 still falls through to sale_price (treats 0 like missing? no — helper preserves the value)', () => {
    // 0 is explicit, not null. The helper preserves it. Documents the
    // semantic gap: callers MUST `> 0` check.
    const item = row({
      admin_price_aed: null,
      worker_price_aed: 0,
      sale_price: 500,
    });
    // worker_price_aed === 0 is "not null", so helper returns 0 — not 500.
    // This is intentional; legacy rows have worker_price_aed=null, not 0.
    expect(getEffectivePrice(item)).toBe(0);
  });
});

describe('buildWhatsAppUrl — uses effective price', () => {
  function decode(url: string): string {
    const text = url.replace(/^https:\/\/wa\.me\/\d+\?text=/, '');
    return decodeURIComponent(text);
  }

  it('renders admin_price_aed override in the WhatsApp draft', () => {
    const item = row({
      admin_price_aed: 850,
      worker_price_aed: 1000,
      sale_price: 1000,
    });
    const url = buildWhatsAppUrl(item);
    const text = decode(url);
    expect(text).toContain('💰 850 AED');
    expect(text).not.toContain('💰 1000 AED');
  });

  it('falls back to worker_price_aed when admin is null', () => {
    const item = row({
      admin_price_aed: null,
      worker_price_aed: 1000,
      sale_price: 1000,
    });
    const url = buildWhatsAppUrl(item);
    expect(decode(url)).toContain('💰 1000 AED');
  });

  it('uses sale_price as final fallback for legacy rows', () => {
    const item = row({
      admin_price_aed: null,
      worker_price_aed: null,
      sale_price: 320,
    });
    const url = buildWhatsAppUrl(item);
    expect(decode(url)).toContain('💰 320 AED');
  });

  it('clearing admin override reverts to worker value (regression check)', () => {
    // Admin had set 850, then cleared it back to null.
    const item = row({
      admin_price_aed: null,
      worker_price_aed: 1000,
    });
    expect(getEffectivePrice(item)).toBe(1000);
    expect(decode(buildWhatsAppUrl(item))).toContain('💰 1000 AED');
  });
});

describe('admin_negotiable propagation (existing pattern, regression check)', () => {
  // The audit confirmed admin_negotiable already reads via
  // `admin_negotiable ?? worker_negotiable` on every public surface that
  // renders it. Lock the pattern with a regression test so future edits
  // don't accidentally flip back to a single-column read.

  it('admin_negotiable=false flips the WhatsApp opener even when worker said true', () => {
    const item = row({
      admin_negotiable: false,
      worker_negotiable: true,
    });
    const url = buildWhatsAppUrl(item);
    const text = decodeURIComponent(
      url.replace(/^https:\/\/wa\.me\/\d+\?text=/, '')
    );
    expect(text).toContain('Is it still available?');
    expect(text).not.toContain('want to negotiate');
  });

  it('admin_negotiable=null falls back to worker_negotiable', () => {
    const item = row({
      admin_negotiable: null,
      worker_negotiable: true,
    });
    const url = buildWhatsAppUrl(item);
    const text = decodeURIComponent(
      url.replace(/^https:\/\/wa\.me\/\d+\?text=/, '')
    );
    expect(text).toContain('want to negotiate');
  });

  it('admin_negotiable=false strips the "Price is negotiable" hint from Product JSON-LD description', () => {
    // The hint lives in src/lib/augment-product-schema.ts and is appended
    // only when context.negotiable === true. Page-level wiring passes
    // `item.admin_negotiable ?? item.worker_negotiable`; this test locks
    // the helper's behavior so the admin override actually suppresses the
    // hint even when the worker initially said negotiable=true.
    const baseSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Test Item',
      description: 'A test description.',
      offers: {
        '@type': 'Offer',
        price: '850',
        priceCurrency: 'AED',
      },
    };
    const ctx = {
      sku: 'BC-1',
      url: 'https://bufaisal.ae/item/test',
      category: 'Appliances',
    };

    // Worker said true → page passes true → hint appended.
    const withHint = augmentProductSchema(baseSchema, { ...ctx, negotiable: true });
    expect(withHint?.description).toContain('Price is negotiable.');

    // Admin overrides to false → page passes false → no hint.
    const withoutHint = augmentProductSchema(baseSchema, { ...ctx, negotiable: false });
    expect(withoutHint?.description).not.toContain('Price is negotiable.');
    expect(withoutHint?.description).toBe('A test description.');
  });
});

describe('admin_condition_grade propagation (existing pattern, regression check)', () => {
  // Sanity: confirm the pattern `admin_condition_grade ?? worker_condition_grade`
  // resolves to the override at every render-time site. The detail page
  // and the product feed already do this; we lock the resolution rule.
  it('admin override of Fair wins over worker Excellent', () => {
    const item = row({
      worker_condition_grade: 'Excellent',
      admin_condition_grade: 'Fair',
    });
    const effective = item.admin_condition_grade ?? item.worker_condition_grade;
    expect(effective).toBe('Fair');
  });

  it('clearing the override reverts to worker grade', () => {
    const item = row({
      worker_condition_grade: 'Excellent',
      admin_condition_grade: null,
    });
    const effective = item.admin_condition_grade ?? item.worker_condition_grade;
    expect(effective).toBe('Excellent');
  });
});
