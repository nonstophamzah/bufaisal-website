import { describe, it, expect } from 'vitest';
import {
  PRODUCT_TYPES,
  BRANDS,
  canonicalProductType,
  canonicalBrand,
  PRODUCT_OTHER,
  BRAND_OTHER,
} from '@/lib/appliance-catalog';

describe('appliance-catalog', () => {
  describe('PRODUCT_TYPES', () => {
    it('has at least 10 product types', () => {
      expect(PRODUCT_TYPES.length).toBeGreaterThanOrEqual(10);
    });

    it('includes common appliance types', () => {
      const typesJoined = PRODUCT_TYPES.join(' ').toLowerCase();
      expect(typesJoined).toContain('refrigerator');
      expect(typesJoined).toContain('washing machine');
    });

    it('has an "Other" entry', () => {
      expect(PRODUCT_OTHER).toBeDefined();
      expect(typeof PRODUCT_OTHER).toBe('string');
    });
  });

  describe('BRANDS', () => {
    it('has at least 50 brands', () => {
      expect(BRANDS.length).toBeGreaterThanOrEqual(50);
    });

    it('includes common appliance brands', () => {
      const brands = BRANDS.map((b) => b.toLowerCase());
      expect(brands).toContain('samsung');
      expect(brands).toContain('lg');
    });

    it('has an "Other" entry', () => {
      expect(BRAND_OTHER).toBeDefined();
      expect(typeof BRAND_OTHER).toBe('string');
    });
  });

  describe('canonicalProductType', () => {
    it('returns canonical name for known types', () => {
      const result = canonicalProductType('refrigerator');
      expect(result.toLowerCase()).toContain('refrigerator');
    });

    it('handles null/undefined gracefully', () => {
      expect(canonicalProductType(null)).toBeDefined();
      expect(canonicalProductType(undefined as unknown as string)).toBeDefined();
    });
  });

  describe('canonicalBrand', () => {
    it('returns canonical name for known brands', () => {
      const result = canonicalBrand('samsung');
      expect(result.toLowerCase()).toContain('samsung');
    });

    it('handles null/undefined gracefully', () => {
      expect(canonicalBrand(null)).toBeDefined();
      expect(canonicalBrand(undefined as unknown as string)).toBeDefined();
    });
  });
});
