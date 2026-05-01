// Slug generation utilities for v2 product URLs (/[category]/[slug]).

const RANDOM_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += RANDOM_SUFFIX_ALPHABET[Math.floor(Math.random() * RANDOM_SUFFIX_ALPHABET.length)];
  }
  return out;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateProductSlug(itemName: string, barcode: string | null): string {
  const base = slugifyName(itemName) || 'item';
  const suffix = barcode && barcode.length >= 1
    ? barcode.slice(-8).toLowerCase()
    : randomSuffix(6);
  return `${base}-${suffix}`;
}
