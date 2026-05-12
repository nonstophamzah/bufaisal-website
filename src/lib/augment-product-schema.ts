// Augments the stored `published_product_schema` with page-level fields
// the AI cannot know at generation time.
//
// Why this exists:
//   The locked SEO Agent v1.0 prompt does not have access to the
//   canonical bufaisal.ae URL, the item's barcode, the resolved category,
//   or the seller block. Filling these at render time keeps the stored
//   schema clean and concentrates all page-time additions in one helper.
//
// Called by:
//   - src/app/item/[id]/page.tsx at JSON-LD injection time
//
// Pure function. Returns a shallow clone — never mutates the input.
// Non-destructive: never overwrites keys already present in the stored
// schema (the AI / admin override is always authoritative).

export interface AugmentProductSchemaContext {
  sku: string | null;
  url: string;
  category: string | null;
  // Source: `admin_negotiable ?? worker_negotiable`. Null on legacy
  // pre-Phase-3 rows (no append). The internal check is strict `=== true`.
  negotiable: boolean | null;
}

export function augmentProductSchema(
  schema: Record<string, unknown> | null | undefined,
  context: AugmentProductSchemaContext
): Record<string, unknown> | null {
  if (schema === null || schema === undefined) return null;
  const next: Record<string, unknown> = { ...schema };

  if (context.sku && next.sku === undefined) {
    next.sku = context.sku;
  }
  if (next.url === undefined) {
    next.url = context.url;
  }
  if (context.category && next.category === undefined) {
    next.category = context.category;
  }

  // Only augment `offers` if the stored schema already has one — never
  // fabricate an offer block. If `offers` is an array (multi-variant),
  // skip augmentation; that shape is out of scope for our single-SKU
  // listings.
  if (
    next.offers &&
    typeof next.offers === 'object' &&
    !Array.isArray(next.offers)
  ) {
    const offers = { ...(next.offers as Record<string, unknown>) };
    if (offers.seller === undefined) {
      // legalName per Bufaisal-Decisions-Log v1.0 (2026-05-01 — Brand
      // name locked): trading name "Bufaisal", legal entity for any
      // compliance-grade structured-data consumer.
      offers.seller = {
        '@type': 'Organization',
        name: 'Bufaisal',
        legalName: 'Bu Faisal General Trading LLC',
      };
    }
    if (offers.url === undefined) {
      offers.url = context.url;
    }
    next.offers = offers;
  }

  // Append negotiable hint to description. Idempotent — `includes` check
  // prevents double-append on re-renders or pre-existing phrasings.
  if (context.negotiable === true && typeof next.description === 'string') {
    const hint = 'Price is negotiable.';
    if (!next.description.includes(hint)) {
      next.description = `${next.description} ${hint}`;
    }
  }

  return next;
}
