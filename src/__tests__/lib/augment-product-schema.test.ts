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
  it('1. Appliance product emits both shippingDetails and hasMerchantReturnPolicy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Appliances',
    });
    const offers = result?.offers as Record<string, unknown>;

    expect(offers.shippingDetails).toBeDefined();
    const shipping = offers.shippingDetails as Record<string, unknown>;
    expect(shipping['@type']).toBe('OfferShippingDetails');
    const rate = shipping.shippingRate as Record<string, unknown>;
    expect(rate.value).toBe(50);
    expect(rate.currency).toBe('AED');
    const dest = shipping.shippingDestination as Record<string, unknown>;
    expect(dest.addressCountry).toBe('AE');

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

  it('2. Non-appliance product (Bedroom & Sleep) emits shippingDetails only — no return policy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: 'Bedroom & Sleep',
    });
    const offers = result?.offers as Record<string, unknown>;
    expect(offers.shippingDetails).toBeDefined();
    expect(offers.hasMerchantReturnPolicy).toBeUndefined();
  });

  it('3. Idempotency — re-augmenting does not duplicate or mutate fields', () => {
    const ctx = { ...baseContext, category: 'Appliances' };
    const once = augmentProductSchema(baseSchema(), ctx);
    const twice = augmentProductSchema(once, ctx);

    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
    const offers = twice?.offers as Record<string, unknown>;
    expect(offers.shippingDetails).toBeDefined();
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

  it('6. Missing/null category emits shippingDetails but no return policy', () => {
    const result = augmentProductSchema(baseSchema(), {
      ...baseContext,
      category: null,
    });
    const offers = result?.offers as Record<string, unknown>;
    expect(offers.shippingDetails).toBeDefined();
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
