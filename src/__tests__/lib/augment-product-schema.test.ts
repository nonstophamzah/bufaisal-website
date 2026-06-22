import { describe, it, expect } from 'vitest';
import {
  augmentProductSchema,
  type AugmentProductSchemaContext,
} from '@/lib/augment-product-schema';

const baseContext: AugmentProductSchemaContext = {
  sku: 'BC-12345',
  url: 'https://bufaisal.ae/item/abc-123',
  category: 'Appliances',
  negotiable: false,
};

const baseSchema = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Test Product',
  description: 'A test product.',
  image: ['https://example.com/img.jpg'],
  offers: {
    '@type': 'Offer',
    price: '299',
    priceCurrency: 'AED',
    availability: 'https://schema.org/InStock',
  },
  ...overrides,
});

describe('augmentProductSchema — Merchant Listings fields', () => {
  // Source of truth for per-emirate rates — keep in sync with
  // EMIRATE_SHIPPING_RATES in src/lib/augment-product-schema.ts.
  const EXPECTED_EMIRATE_RATES: Record<string, number> = {
    Ajman: 85,
    Sharjah: 145,
    'Umm Al Quwain': 120,
    Dubai: 240,
    'Ras Al Khaimah': 240,
    Fujairah: 265,
    'Abu Dhabi': 300,
  };

  it('1. Appliance product emits both shippingDetails array and hasMerchantReturnPolicy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Appliances',
    });
    const offers = result?.offers as Record<string, unknown>;

    expect(Array.isArray(offers.shippingDetails)).toBe(true);
    const shipping = offers.shippingDetails as Array<Record<string, unknown>>;
    expect(shipping).toHaveLength(7);

    for (const entry of shipping) {
      expect(entry['@type']).toBe('OfferShippingDetails');
      const dest = entry.shippingDestination as Record<string, unknown>;
      expect(dest.addressCountry).toBe('AE');
      expect(typeof dest.addressRegion).toBe('string');
    }

    // Each emirate appears exactly once with its expected rate.
    const byRegion = new Map<string, number>();
    for (const entry of shipping) {
      const dest = entry.shippingDestination as Record<string, unknown>;
      const rate = entry.shippingRate as Record<string, unknown>;
      byRegion.set(dest.addressRegion as string, rate.value as number);
    }
    expect(byRegion.size).toBe(7);
    for (const [region, expectedRate] of Object.entries(EXPECTED_EMIRATE_RATES)) {
      expect(byRegion.get(region)).toBe(expectedRate);
    }

    expect(offers.hasMerchantReturnPolicy).toBeDefined();
    const policy = offers.hasMerchantReturnPolicy as Record<string, unknown>;
    expect(policy['@type']).toBe('MerchantReturnPolicy');
    expect(policy.applicableCountry).toEqual(['AE']);
    expect(policy.returnPolicyCategory).toBe(
      'https://schema.org/MerchantReturnFiniteReturnWindow'
    );
    expect(policy.merchantReturnDays).toBe(7);
    expect(policy.returnMethod).toBe('https://schema.org/ReturnInStore');
    expect(policy.returnFees).toBe('https://schema.org/FreeReturn');
  });

  it('1b. All 7 shipping entries share the same deliveryTime and currency', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Appliances',
    });
    const offers = result?.offers as Record<string, unknown>;
    const shipping = offers.shippingDetails as Array<Record<string, unknown>>;

    const deliveryTimes = new Set(shipping.map((e) => JSON.stringify(e.deliveryTime)));
    expect(deliveryTimes.size).toBe(1);

    for (const entry of shipping) {
      const rate = entry.shippingRate as Record<string, unknown>;
      expect(rate.currency).toBe('AED');
      expect(rate['@type']).toBe('MonetaryAmount');
    }
  });

  it('2. Non-appliance product (Bedroom Furniture) emits shippingDetails array only — no return policy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Bedroom Furniture',
    });
    const offers = result?.offers as Record<string, unknown>;
    expect(Array.isArray(offers.shippingDetails)).toBe(true);
    expect(offers.shippingDetails as unknown[]).toHaveLength(7);
    expect(offers.hasMerchantReturnPolicy).toBeUndefined();
  });

  it('3. Idempotency — re-augmenting does not duplicate the 7 shipping entries or mutate fields', () => {
    const ctx = { ...baseContext, category: 'Appliances' };
    const once = augmentProductSchema(baseSchema(), ctx);
    const twice = augmentProductSchema(once, ctx);

    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
    const offers = twice?.offers as Record<string, unknown>;
    expect(Array.isArray(offers.shippingDetails)).toBe(true);
    expect(offers.shippingDetails as unknown[]).toHaveLength(7);
    expect(offers.hasMerchantReturnPolicy).toBeDefined();
  });

  it('4. Existing shippingDetails on input is not overwritten', () => {
    const existing = {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        value: 999,
        currency: 'USD',
      },
    };
    const input = baseSchema({
      offers: {
        '@type': 'Offer',
        price: '299',
        priceCurrency: 'AED',
        availability: 'https://schema.org/InStock',
        shippingDetails: existing,
      },
    });
    const result = augmentProductSchema(input, baseContext);
    const offers = result?.offers as Record<string, unknown>;
    expect(offers.shippingDetails).toEqual(existing);
  });

  it('5. Existing hasMerchantReturnPolicy on input is not overwritten', () => {
    const existing = {
      '@type': 'MerchantReturnPolicy',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
    };
    const input = baseSchema({
      offers: {
        '@type': 'Offer',
        price: '299',
        priceCurrency: 'AED',
        availability: 'https://schema.org/InStock',
        hasMerchantReturnPolicy: existing,
      },
    });
    const result = augmentProductSchema(input, {
      ...baseContext,
      category: 'Appliances',
    });
    const offers = result?.offers as Record<string, unknown>;
    expect(offers.hasMerchantReturnPolicy).toEqual(existing);
  });

  it('6. Missing/null category emits shippingDetails array but no return policy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: null,
    });
    const offers = result?.offers as Record<string, unknown>;
    expect(Array.isArray(offers.shippingDetails)).toBe(true);
    expect(offers.shippingDetails as unknown[]).toHaveLength(7);
    expect(offers.hasMerchantReturnPolicy).toBeUndefined();
  });

  it('7. Case-insensitive match for "Appliances" — lowercase and mixed case both match', () => {
    for (const cat of ['appliances', 'APPLIANCES', 'Appliances', 'aPPlIaNcEs']) {
      const result = augmentProductSchema(baseSchema(), {
        ...baseContext,
        category: cat,
      });
      const offers = result?.offers as Record<string, unknown>;
      expect(offers.hasMerchantReturnPolicy).toBeDefined();
    }
  });

  it('8. Output is structurally valid Product+Offer with the new fields nested under offers', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Appliances',
    });
    expect(result?.['@type']).toBe('Product');
    expect(result?.offers).toBeDefined();
    expect(Array.isArray(result?.offers)).toBe(false);
    const offers = result?.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    // shippingDetails is itself an array (per-emirate), but the offer
    // block remains a single object — never an array of Offers.
    expect(Array.isArray(offers.shippingDetails)).toBe(true);
    // The new fields live under Offer, not Product top-level.
    expect((result as Record<string, unknown>).shippingDetails).toBeUndefined();
    expect(
      (result as Record<string, unknown>).hasMerchantReturnPolicy
    ).toBeUndefined();
  });

  it('9. Existing augmented fields (sku, url, category, seller) still present after change', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Appliances',
    });
    expect(result?.sku).toBe('BC-12345');
    expect(result?.url).toBe('https://bufaisal.ae/item/abc-123');
    expect(result?.category).toBe('Appliances');
    const offers = result?.offers as Record<string, unknown>;
    expect(offers.seller).toEqual({
      '@type': 'Organization',
      name: 'Bufaisal',
      legalName: 'Bu Faisal General Trading LLC',
    });
    expect(offers.url).toBe('https://bufaisal.ae/item/abc-123');
  });

  it('skips augmentation when offers is an array (multi-variant, out of scope)', () => {
    const input = baseSchema({
      offers: [
        { '@type': 'Offer', price: '299', priceCurrency: 'AED' },
        { '@type': 'Offer', price: '399', priceCurrency: 'AED' },
      ],
    });
    const result = augmentProductSchema(input, {
      ...baseContext,
      category: 'Appliances',
    });
    // offers stays as the original array; no shippingDetails/policy injected.
    expect(Array.isArray(result?.offers)).toBe(true);
  });

  it('returns null when input schema is null', () => {
    expect(augmentProductSchema(null, baseContext)).toBeNull();
    expect(augmentProductSchema(undefined, baseContext)).toBeNull();
  });
});
