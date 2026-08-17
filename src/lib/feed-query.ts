// What the public feed selects, and the guard on how much it may select.
//
// Why this exists:
//   Every feed fetch used `select('*')`, which ships all 67 columns of
//   shop_items — including five JSONB schema blobs (published_product_schema,
//   published_faq_schema, published_spec_table, published_faqs,
//   published_trust_signals) that only /item/[id] ever reads. Measured on live
//   2026-08-17: ~16 KB of HTML per card, so the homepage cost 849 KB at page 1
//   and 5.27 MB at page 7, and a full scroll transferred ~22 MB.
//
//   ItemCard needs about fifteen fields. This is that list.
//
// Defined ONCE and consumed by all four feed fetch sites, so they cannot
// drift apart:
//   - getItems()   in src/app/page.tsx        (homepage SSR)
//   - getItems()   in src/app/shop/page.tsx   (shop SSR + the ItemList JSON-LD)
//   - buildQuery() in src/app/shop/shop-client.tsx  (live as-you-type search)
//   - subcatPool   in src/app/shop/shop-client.tsx  (subcategory tab pool)
//
// This is NOT for /item/[id]. That page needs the JSONB schema columns and
// condition_notes, none of which are here.

/**
 * Columns every public feed surface reads. Derived by grepping every consumer
 * rather than by guessing — the non-obvious entries are called out below.
 *
 * If you add a feed surface that reads a new column, add it HERE, not at the
 * call site. Anything missing degrades to `undefined` at runtime, and
 * TypeScript will not catch it: rows are cast to ShopItem, whose fields are
 * nullable. The regression test is a byte-identical diff of rendered page-1
 * HTML (markup + JSON-LD) before and after any change to this list.
 *
 * Deliberately EXCLUDED: the five JSONB schema blobs (the bulk of the payload,
 * /item/[id] only), every ai_* column except ai_barcode_extracted, all
 * admin_approved_* / audit / workflow columns, and condition_notes — grepped
 * 2026-08-17, read only by /item/[id], /admin and the AI routes.
 */
export const FEED_COLUMNS = [
  'id',
  'is_featured', // homepage interleave pins these first; ItemCard star badge
  'is_sold', // always false given the WHERE, but ItemCard reads it
  'created_at', // interleave freshness boost + "Just Arrived" badge + ordering

  // resolvePublicItemFields() pairs — `published_* ?? legacy_*`. The legacy
  // halves still serve pre-Phase-5 rows and must stay until those columns are
  // dropped from shop_items (Phase 9+).
  'published_item_name',
  'item_name',
  'published_brand',
  'brand', // ItemList JSON-LD brand
  'published_category',
  'category', // interleave buckets + category filters
  'published_description',
  'description', // ItemList JSON-LD description

  // getItemImageUrl() / resolveItemImageUrl() fallback chain
  'thumbnail_url',
  'image_urls',
  'worker_photo_brand_url',
  'worker_photo_2_url',
  'worker_photo_3_url',
  'worker_photo_barcode_url',

  // getEffectivePrice() precedence: admin ?? worker ?? legacy
  'admin_price_aed',
  'worker_price_aed',
  'sale_price',

  'admin_negotiable',
  'worker_negotiable', // Negotiable chip + WhatsApp opener wording
  'admin_condition_grade',
  'worker_condition_grade', // condition badge
  'worker_shop_id', // getShop() → shop badge + WhatsApp location line

  // NOT decorative: buildWhatsAppUrl() puts this in the 🔖 line of the
  // Negotiate pre-fill. It is the one ai_* column the feed needs, and dropping
  // it silently removes the barcode from every WhatsApp message.
  'ai_barcode_extracted',
].join(',');

/**
 * Narrow a feed query result to ShopItem[].
 *
 * supabase-js can only infer a row type from a select() it can read as a
 * string LITERAL. FEED_COLUMNS is built at runtime, so the client types the
 * result as GenericStringError[] and a direct `as ShopItem[]` is a compile
 * error. The cast is sound: every column above exists on ShopItem, and the
 * omitted ones are all nullable, so absent properties read as undefined and
 * the `??` chains in resolvePublicItemFields / getEffectivePrice / the
 * item-image fallback handle them exactly as they handle null.
 *
 * Centralised here so the unavoidable cast is explained once instead of
 * repeated at five call sites.
 */
export function asShopItems<T>(data: T[] | null): import('./supabase').ShopItem[] {
  return (data ?? []) as unknown as import('./supabase').ShopItem[];
}

/**
 * PostgREST caps a response at 1000 rows. The homepage fetches the WHOLE
 * visible catalog on every request (the category interleave needs it), so once
 * the catalog crosses that cap the feed tail is silently truncated — items
 * simply stop appearing on the site, with no error anywhere.
 *
 * console.error rather than warn, and deliberately loud: the failure mode is
 * invisible, so the log line is the only thing that will ever surface it.
 * Flagged as a known limitation in the 2026-06-22 handoff and still unfixed —
 * the real fix is B2 (cursor over a frozen rank window), triggered by this.
 */
export const FEED_ROW_CAP = 1000;
export const FEED_ROW_CAP_ALERT_AT = 900;

export function checkFeedRowCap(rowCount: number, route: string): void {
  if (rowCount >= FEED_ROW_CAP_ALERT_AT) {
    console.error(
      `[feed-row-cap] ${route} returned ${rowCount} rows, at or above the ` +
        `${FEED_ROW_CAP_ALERT_AT} alert threshold (PostgREST hard cap ${FEED_ROW_CAP}). ` +
        `The feed tail will be SILENTLY TRUNCATED once the visible catalog ` +
        `reaches ${FEED_ROW_CAP} — items will vanish from the site with no error. ` +
        `This is the trigger for cursor-based pagination (B2).`
    );
  }
}
