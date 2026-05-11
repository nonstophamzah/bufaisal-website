// Substitutes the placeholder `image[]` array in an AI-generated
// product_schema with real Cloudinary photo URLs at publish time.
//
// Why this exists:
//   The locked SEO Agent v1.0 prompt (lib/prompts/listing-generator-v1.md
//   section L) instructs the model to emit `image: array of all 4 photo
//   URLs`, but the model never receives the URLs in its inputs — only the
//   image bytes themselves. So Sonnet invents placeholder tokens like
//   "photo_1_url" or "photo_4_barcode_url". Token names drift across
//   rows, so substitution must be positional, not name-based.
//
// Called by:
//   - src/lib/admin-pending-publish.ts (every approval)
//   - src/scripts/backfill-schema-images.ts (one-shot for already-published rows)
//
// Pure function. Returns a shallow clone — never mutates the input schema.

import { getAllItemPhotos, type AllPhotosSource } from '@/lib/item-image';

export function substituteSchemaImages(
  schema: Record<string, unknown> | null | undefined,
  item: AllPhotosSource
): Record<string, unknown> | null {
  if (schema === null || schema === undefined) return null;
  const photos = getAllItemPhotos(item);
  const next: Record<string, unknown> = { ...schema };
  if (photos.length > 0) {
    next.image = photos;
  } else {
    delete next.image;
  }
  return next;
}
