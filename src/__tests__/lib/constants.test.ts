import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/constants';

describe('constants', () => {
  it('has 8 categories defined', () => {
    expect(CATEGORIES.length).toBe(8);
  });

  it('each category has name, slug, and image', () => {
    for (const cat of CATEGORIES) {
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('slug');
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.slug).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      expect(cat.slug.length).toBeGreaterThan(0);
    }
  });

  it('category slugs are unique', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('category names are unique', () => {
    const names = CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
