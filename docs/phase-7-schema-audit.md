# Phase 7 Pre-Audit — Schema Markup Inventory

**Date:** 2026-05-13
**Auditor:** Claude (read-only)
**Scope:** JSON-LD coverage on bufaisal.ae prior to Phase 7 (SEO schema upgrades).
**Branch:** `claude/adoring-sutherland-4237ed` (worktree clean, no code modified).

---

## Section 1 — JSON-LD in Codebase

Found via `grep -rn "application/ld+json"` and `grep -rn "@context"` across `src/`. No other emission sites exist outside these files.

| File:line | Schema type | Page(s) | SSR/CSR | Keys |
|---|---|---|---|---|
| `src/app/layout.tsx:114` | **Organization** | every page (root layout) | SSR | `@context, @type, name, url, logo, foundingDate, description, address {addressLocality, addressCountry}, contactPoint {telephone, contactType, availableLanguage}, sameAs[]` |
| `src/app/layout.tsx:141` | **WebSite** (Sitelinks searchbox) | every page (root layout) | SSR | `@context, @type, name, url, potentialAction {target {urlTemplate}, query-input}` |
| `src/app/page.tsx:134` | **LocalBusiness** | `/` (homepage) | SSR | `@context, @type, name, description, url, telephone, address {addressLocality, addressCountry}, geo {latitude, longitude}, openingHours, priceRange, image, sameAs[]` |
| `src/app/page.tsx:138` | **FAQPage** | `/` (homepage) | SSR | `@context, @type, mainEntity[]` (4 Q&A) |
| `src/app/shop/page.tsx:155` | **LocalBusiness** | `/shop` (and `/shop?category=…`) | SSR | identical to homepage LocalBusiness |
| `src/app/shop/page.tsx:160` | **FAQPage** | `/shop` | SSR | identical to homepage FAQPage |
| `src/app/shop/shop-client.tsx:199` | **ItemList** | `/shop?category=…` only (hidden when `!catName \|\| items.length===0`) | **CSR (`useMemo` inside client component)** | `@context, @type, name, numberOfItems, itemListElement[] {position, item{@type:Product, name, description, url, image, brand, offers{availability, priceCurrency, price, seller}, itemCondition}}` |
| `src/app/item/[id]/page.tsx:129` | **Product** | `/item/[id]` | SSR | stored `published_product_schema` + augmented (sku, url, category, seller, "Price is negotiable." description hint) — see Section 5 |
| `src/app/item/[id]/page.tsx:135` | **FAQPage** | `/item/[id]` | SSR | stored `published_faq_schema` verbatim |
| `src/app/item/[id]/page.tsx:141` | **BreadcrumbList** | `/item/[id]` | SSR | `@context, @type, itemListElement[] {@type, position, name, item?}` |

**Helpers that shape these payloads:**
- `src/lib/augment-product-schema.ts` — render-time, non-destructive. Adds `sku`, `url`, `category`, `offers.seller {name:"Bufaisal", legalName:"Bu Faisal General Trading LLC"}`, `offers.url`, idempotent `description` "Price is negotiable." suffix.
- `src/lib/resolve-schema-images.ts` — publish-time, populates `image[]` on stored schema using 4 `worker_photo_*` columns. Pure clone.

**Pages with no JSON-LD beyond the root-layout Organization + WebSite:**
- `/categories` — emits only the inherited Organization + WebSite from `layout.tsx`. No CollectionPage schema.
- `/about`, `/contact`, `/team`, `/admin*`, `/appliances*` — covered by root layout only (the admin/appliance/team routes don't need product schema; about/contact pages would benefit from a future pass, out of Phase 7 scope).

---

## Section 2 — Live-Site Rendered Schema

Methodology: `curl` with a desktop User-Agent against `https://bufaisal.ae/*` (production), then regex-extract every `<script type="application/ld+json">` and parse with Python `json.loads`. WebFetch's HTML→markdown conversion strips `<script>` tags so curl was used.

### Homepage — `https://bufaisal.ae/`

4 JSON-LD blocks rendered (matches Section 1 expectations):

| # | @type | Keys |
|---|---|---|
| 0 | Organization | `@context, @type, name, url, logo, foundingDate, description, address, contactPoint, sameAs` |
| 1 | WebSite | `@context, @type, name, url, potentialAction` |
| 2 | LocalBusiness | `@context, @type, name, description, url, telephone, address, geo, openingHours, priceRange, image, sameAs` |
| 3 | FAQPage | `@context, @type, mainEntity` |

### Product page — `https://bufaisal.ae/item/4cea5546-1da6-48cb-b6c2-bf7a61232278` (Used Hitachi Top-Mount Refrigerator)

5 JSON-LD blocks rendered (Organization + WebSite from root layout + 3 page-level):

| # | @type | Keys |
|---|---|---|
| 0 | Organization | (same as homepage) |
| 1 | WebSite | (same as homepage) |
| 2 | **Product** | `name, @type, brand, image[4 urls], offers {price:800, availability, priceCurrency:AED, seller{name, legalName}, url}, @context, description, itemCondition, url, category` |
| 3 | FAQPage | `@type, @context, mainEntity` |
| 4 | BreadcrumbList | `@context, @type, itemListElement` (4 levels: Home → Shop → Appliances → leaf) |

Full Product payload (verbatim, formatted):

```json
{
  "name": "Used Hitachi Top-Mount Inverter Refrigerator",
  "@type": "Product",
  "brand": {"name": "Hitachi", "@type": "Brand"},
  "image": [
    "https://res.cloudinary.com/df8y0k626/image/upload/v1778417646/kblu4aeyiqueaf8xknpq.jpg",
    "https://res.cloudinary.com/df8y0k626/image/upload/v1778417652/sjn8mfhy2xvp8hvfmeiw.jpg",
    "https://res.cloudinary.com/df8y0k626/image/upload/v1778417661/lremqzn2wtdbjjjjlt5n.jpg",
    "https://res.cloudinary.com/df8y0k626/image/upload/v1778417666/fjlezcui08u0xkitwe4i.jpg"
  ],
  "offers": {
    "@type": "Offer",
    "price": 800,
    "availability": "https://schema.org/InStock",
    "priceCurrency": "AED",
    "seller": {"@type": "Organization", "name": "Bufaisal", "legalName": "Bu Faisal General Trading LLC"},
    "url": "https://bufaisal.ae/item/4cea5546-1da6-48cb-b6c2-bf7a61232278"
  },
  "@context": "https://schema.org",
  "description": "Used Hitachi top-mount refrigerator with inverter and dual fan cooling. Interior shelving is intact and clean. Minor surface scratches on the exterior door do not affect function. Tested by our team before listing. 7-day warranty included. Available at Shop A, Ajman. Click Negotiate on WhatsApp. Price is negotiable.",
  "itemCondition": "https://schema.org/UsedCondition",
  "url": "https://bufaisal.ae/item/4cea5546-1da6-48cb-b6c2-bf7a61232278",
  "category": "Appliances"
}
```

Notable observations on the live Product schema:
- **`sku` is absent.** The augmenter only adds `sku` if `item.ai_barcode_extracted` is non-null — for this row the AI did not extract a barcode. Consider this the norm, not an exception.
- **`mpn`/`gtin` never emitted.** Not produced by the prompt (`lib/prompts/listing-generator-v1.md` section L).
- **`shippingDetails`, `hasMerchantReturnPolicy`, `aggregateRating`, `review` all absent.** No code path emits any of these anywhere in the repo.

### Categories page — `https://bufaisal.ae/categories`

2 JSON-LD blocks rendered — ONLY the root-layout inheritance:

| # | @type | Keys |
|---|---|---|
| 0 | Organization | (same as homepage) |
| 1 | WebSite | (same as homepage) |

**No CollectionPage, no ItemList, no per-category Product schema.**

### `/shop` page — bonus verification

4 blocks: Organization + WebSite + LocalBusiness + FAQPage. **No ItemList in initial HTML** (confirmed). `shop-client.tsx` does emit ItemList — but only inside a CSR `useMemo` gated on `catName && items.length > 0`, and only after hydration. Googlebot would need to render JS to see it; the SSR HTML does not contain it. This matches the CLAUDE.md note: "Currently emitted client-side in `shop-client.tsx:163-193`; move to SSR so crawlers see it in initial HTML."

---

## Section 3 — Rich Results Evaluation

Methodology: manual evaluation against Google's documented required/recommended fields. References:
- Product snippet / Merchant listings: https://developers.google.com/search/docs/appearance/structured-data/product
- FAQ: https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Breadcrumb: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- LocalBusiness: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Organization: https://developers.google.com/search/docs/appearance/structured-data/organization
- Sitelinks searchbox: https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox

### Homepage — `/`

**Organization (root layout)**
- Required: `name` ✓, `url` ✓
- Recommended: `logo` ✓, `sameAs[]` ✓, `description` ✓, `address` ✓ (partial — no `streetAddress` or `postalCode`), `contactPoint` ✓
- Missing for full eligibility: `aggregateRating` (would unlock store-level stars in SERP), `streetAddress`, `postalCode`, `email`
- Eligible rich result: **Knowledge Panel candidate.** Star-rating block blocked by missing `aggregateRating`.
- Errors: none.

**WebSite**
- Required: `name` ✓, `url` ✓, `potentialAction.target.urlTemplate` ✓, `potentialAction.query-input` ✓
- Eligible rich result: **Sitelinks searchbox** (fully eligible).
- Errors: none.

**LocalBusiness (homepage + shop)**
- Required: `name` ✓, `address` (with `addressLocality`+`addressCountry`) ✓, `telephone` ✓ (also serves Google merchant verification)
- Recommended: `geo` ✓ (single coord — but Bufaisal has **5 shops**, so this single coord materially misrepresents the business), `openingHours` ✓ (string form; the array+`OpeningHoursSpecification` form is preferred), `priceRange` ✓ ("AED" — Google expects a range like "$$" or "AED 50 - AED 5000"; current value is technically valid but uninformative), `image` ✓, `url` ✓
- Missing for full eligibility: `streetAddress`, `postalCode`, `aggregateRating` (no aggregated rating ⇒ no star rendering)
- **Structural concern:** The current single LocalBusiness with one address+geo collapses 5 physical shops into 1. Google's docs recommend a separate LocalBusiness entry per location (or a `Store` per-branch with shared parent Organization). This costs Bufaisal eligibility for store-locator-style rich results and per-shop maps integration.
- Errors: none structural; recommendations not met.

**FAQPage**
- Required: `mainEntity[]` of `Question` with nested `acceptedAnswer.Answer.text` ✓
- Eligible rich result: **FAQ rich result** (fully eligible; same FAQPage duplicated on `/shop` and `/` — Google may pick one or apply duplicate-content rules. Acceptable but slightly noisy.)
- Errors: none.

### Product page — `/item/[id]`

**Product (Hitachi reference row)**

| Field | Status | Notes |
|---|---|---|
| `@context`, `@type:Product` | ✓ | |
| `name` | ✓ | "Used Hitachi Top-Mount Inverter Refrigerator" |
| `image[]` | ✓ | 4 Cloudinary URLs (positional from `worker_photo_*`) |
| `description` | ✓ | 296 chars |
| `offers.price` | ✓ | numeric 800 |
| `offers.priceCurrency` | ✓ | "AED" |
| `offers.availability` | ✓ | `InStock` |
| `offers.url` | ✓ | (augmenter) |
| `offers.seller` | ✓ | Organization with `legalName` |
| `brand` | ✓ | Brand "Hitachi" |
| `itemCondition` | ✓ | `UsedCondition` |
| `category` | ✓ | (augmenter) |
| `url` | ✓ | (augmenter) |
| `sku` | ✗ | augmenter only adds when `ai_barcode_extracted` non-null |
| `mpn` / `gtin*` | ✗ | not emitted anywhere |
| `aggregateRating` | ✗ | per-product reviews not feasible for second-hand turnover |
| `review[]` | ✗ | same |
| `shippingDetails` | ✗ | required for Merchant Listings rich result |
| `hasMerchantReturnPolicy` | ✗ | required for Merchant Listings rich result |

- Eligible rich result: **Product snippet** ✓ (basic Product snippet renders today — `name`, `image`, `price`, `availability`, `brand`, `itemCondition` are all present).
- **Merchant listings: NOT eligible** until `shippingDetails` + `hasMerchantReturnPolicy` are added. (Google Search Console will surface "warnings" — non-blocking but they suppress the richer SERP card with shipping/return info.)
- Errors: none structural. The Hitachi row has passed Google Rich Results Test as 5 valid items per CLAUDE.md.

**FAQPage (per-product)**
- Required: `mainEntity[]` of `Question` ✓ (stored verbatim, ships 4 Q&A per item)
- Eligible rich result: FAQ rich result ✓
- Errors: none.

**BreadcrumbList**
- Required: `itemListElement[]` with `position` + `name` + `item` URL ✓ (leaf intentionally omits `item` — that's per Google's documented pattern)
- Eligible rich result: Breadcrumb ✓
- Errors: none.

### Categories page — `/categories`

- Inherits Organization + WebSite only.
- **No page-specific schema.** No CollectionPage, no ItemList, no per-category linking schema. Page presents 8 category cards with item counts but ships zero structured signal for them.
- Eligible rich result: none beyond root-layout inheritance.
- Errors: none, but a missed opportunity.

---

## Section 4 — LocalBusiness Status

**Present**, but in a degenerate form:

- `src/app/page.tsx:91-117` emits one `LocalBusiness` for `/`.
- `src/app/shop/page.tsx:111-137` emits an identical `LocalBusiness` for `/shop` (and `/shop?category=…`).
- **Both collapse all 5 shops into a single entity** with one `address {addressLocality:"Ajman", addressCountry:"AE"}` and one `geo {25.4052, 55.5136}`.
- **The 5 shops (BF1–BF5) are NOT represented as separate Place, PostalAddress, or LocalBusiness nodes anywhere in the codebase.**
- `src/lib/shops.ts` has the canonical per-shop config (`displayName`, `mapUrl` Google Business Profile share links for each of BF1–BF5), but is read only by `/item/[id]` for the spec-table Location link. It is NOT consumed by any schema emitter.
- No `Store`, no `Place`, no nested `location[]`, no `parentOrganization` linkage.

**Implication:** Phase 7 has a clean expansion path. The 5 GBP `share.google/...` URLs are perfect `sameAs` / `url` candidates for per-shop LocalBusiness nodes. The 2,390+ Google reviews are tied to individual GBP listings — to surface them in `aggregateRating`, the cleanest model is one LocalBusiness per shop with each shop's own rating, OR a single Organization with an aggregated `aggregateRating` summing across all 5.

---

## Section 5 — Merchant Listings Readiness — Product Schema

Field-by-field for `/item/[id]` against Google's required + recommended Product / Merchant listings fields. "Stored" = `published_product_schema` written by SEO Agent v1.0. "Augmented" = added by `augmentProductSchema()` at render time.

### Basic Product (required for Product snippet — already eligible)

| Field | Stored | Augmented | Live (Hitachi) | Status |
|---|---|---|---|---|
| `name` | ✓ | — | ✓ | OK |
| `image[]` | ✓ (publish-time substitution) | — | ✓ | OK |
| `offers.price` | ✓ | — | ✓ | OK |
| `offers.priceCurrency` | ✓ | — | ✓ | OK |
| `offers.availability` | ✓ | — | ✓ | OK |

### Merchant Listings (required for Google Shopping rich result — NOT eligible today)

| Field | Stored | Augmented | Live | Status |
|---|---|---|---|---|
| `shippingDetails {shippingRate, deliveryTime, shippingDestination}` | ✗ | ✗ | ✗ | **MISSING** |
| `hasMerchantReturnPolicy {returnPolicyCategory, merchantReturnDays, returnMethod, returnFees}` | ✗ | ✗ | ✗ | **MISSING** |

These two fields are the gate to the Google Shopping rich result. Both are page-level invariants (same shipping policy + same 7-day return policy for every product), so the right injection point is `augmentProductSchema()`, not the AI prompt.

### Recommended (lifts ranking + appearance even without merchant listing)

| Field | Stored | Augmented | Live | Notes |
|---|---|---|---|---|
| `brand` | ✓ (when known, "Unknown" otherwise) | — | ✓ | OK |
| `sku` | ✗ | ✓ from `ai_barcode_extracted` when present | ✗ on Hitachi (no barcode extracted) | Conditional. Consider falling back to item UUID. |
| `mpn` | ✗ | ✗ | ✗ | Not feasible — used items rarely have MPN readable. |
| `gtin*` (8/12/13/14) | ✗ | ✗ | ✗ | Same — could be extracted from barcode in future iteration. |
| `aggregateRating` | ✗ | ✗ | ✗ | Per-product ratings not feasible for second-hand turnover. Belongs on Organization-level. |
| `review[]` | ✗ | ✗ | ✗ | Same. |
| `itemCondition` | ✓ | — | ✓ | OK |
| `seller` | ✗ (omitted by prompt) | ✓ (Organization + legalName) | ✓ | OK |
| `category` | ✗ (omitted by prompt) | ✓ | ✓ | OK |
| `url` | ✗ | ✓ | ✓ | OK |

**Summary:** Today's Product schema is **eligible for Product snippet but NOT Merchant Listings**. Two augmenter additions (shippingDetails + hasMerchantReturnPolicy) flip every existing publish to Merchant-Listings-eligible with zero AI-prompt change and zero DB migration.

---

## Summary — Ranked Phase 7 Opportunities

The 5 candidates from CLAUDE.md, scored on effort (S/M/L), risk of zero SERP impact (low/medium/high), and eligibility unlock (new rich-result class y/n):

| # | Candidate | Effort | Risk of zero impact | Unlocks new rich result | Notes |
|---|---|---|---|---|---|
| **1** | **Organization `aggregateRating`** (Org-level) | **S** | **Low** | **Yes — gold stars next to "Bufaisal" in SERP** | One-file change in `src/app/layout.tsx` Organization block. 2,390+ aggregated Google reviews across 5 shops = trivially defensible value (`ratingValue`, `reviewCount`, `bestRating:5`). Unblocks Product snippet + Merchant listing warnings simultaneously because Google's Search Console reads Org-level aggregateRating up the schema hierarchy. |
| **2** | **Merchant `shippingDetails` + `hasMerchantReturnPolicy`** | **S** | **Low** | **Yes — Google Shopping rich result, shipping info badge** | Both go into `augmentProductSchema()`. Page-level invariants (24-48hr delivery + 7-day warranty are already on every page in display copy). Lifts every existing publish without DB migration. Highest ranking impact per byte added. |
| 3 | **SSR ItemList on `/shop`** | M | Medium | Maybe — Google may consume `ItemList` for category SERP results | Move `shop-client.tsx:162-193` `useMemo` to server. Currently only renders for `catName && items.length > 0`. Once SSR'd, also fixes the gap on `/shop?category=` URLs where Googlebot currently sees only LocalBusiness+FAQPage. |
| 4 | **CollectionPage on `/categories`** | M | High | No — CollectionPage rarely produces standalone rich results | Adds schema to a low-traffic page. Defensible for AEO / GEO (LLM grounding), not for direct SERP wins. Defer. |
| 5 | **Organization `postalCode` + `streetAddress`** | S | Medium | No — Knowledge Panel polish only | Trivial change. Fills the remaining Organization warning. Pairs naturally with item 1 in the same PR. |

### Recommended first Phase 7 PR

Ship **items 1 + 5 together as PR #52 (Org-level aggregateRating + address completeness)**, then ship **item 2 as PR #53 (Merchant Listings eligibility)**.

Reasoning:
- Items 1 + 5 both touch `src/app/layout.tsx` Organization block — bundling avoids two PRs against the same 30-line section.
- Item 1 is the highest-leverage SEO win in the audit: the 2,390+ Google reviews are a real, defensible signal already live on Google Business Profile, and lifting them into Organization schema produces gold stars next to "Bufaisal" in branded search (huge CTR lift) AND unblocks both Product / Merchant warnings via schema-hierarchy inheritance.
- Item 2 is independent of items 1+5 (touches `src/lib/augment-product-schema.ts`, not `layout.tsx`), so it ships cleanly as a separate PR with its own verification: Rich Results Test on the Hitachi reference row should flip from "Product snippet" only to "Product snippet + Merchant listing."
- Items 3 + 4 are not blocking and require more careful per-page work — defer to Phase 7.2 / 7.3.

### Open questions to resolve before PR #52

1. **Single `aggregateRating` vs per-shop?** Recommend single Org-level aggregate first (simple, highest leverage). Per-shop LocalBusinesses can come in a Phase 7.4 with `streetAddress` + `postalCode` per branch.
2. **`ratingValue` source?** Hamzah to confirm the current aggregated Google rating across BF1–BF5 (likely 4.5–4.7 range) and the `reviewCount` (mentioned as "2,390+" in CLAUDE.md). Conservatively round down `ratingValue`, use exact integer `reviewCount`.
3. **Bufaisal trade license number?** Optional but useful for `Organization.identifier` (compliance signal). Defer if not readily available.
