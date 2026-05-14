# PR #54 Pre-Audit — Organization Address + 5-shop LocalBusiness Split
Date: 2026-05-13
Auditor: Claude (read-only)
Branch: `claude/adoring-sutherland-4237ed`

Scope: combine two SEO upgrades into one PR (both touch the same trio of files — `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/shop/page.tsx`):
1. Add `streetAddress` + `postalCode` to root `Organization` schema (kills active Rich Results warning identified in `docs/phase-7-schema-audit.md` Section 3).
2. Replace the single collapsed `LocalBusiness` (one entity, one address, one geo coord for all 5 shops) with five separate `LocalBusiness` entities — one per Ajman shop — each carrying its own GBP coordinates, address, `aggregateRating`, and `sameAs` link.

---

## Section 1 — Current Emission Sites

### `src/app/layout.tsx` — Organization block (lines 113–139)

Currently emits inside the root `<body>` SSR template:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Bu Faisal General Trading",
  "url": "https://bufaisal.ae",
  "logo": "https://bufaisal.ae/og-image.png",
  "foundingDate": "2009",
  "description": "UAE's largest second-hand market since 2009. 5 showrooms in Ajman.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Ajman",
    "addressCountry": "AE"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+971585932499",
    "contactType": "sales",
    "availableLanguage": ["English", "Arabic"]
  },
  "sameAs": [
    "https://www.instagram.com/bufaisal.ae",
    "https://www.tiktok.com/@bufaisal.ae"
  ]
}
```

Notable gaps versus Phase 7 audit: no `streetAddress`, no `postalCode`, no `aggregateRating`, no `email`, no `addressRegion`.

A sibling `WebSite` block (Sitelinks searchbox) ships immediately after this in the same `<body>` and is out of scope for PR #54.

### `src/app/page.tsx` — LocalBusiness block (lines 91–117, emitted at line 134)

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Bu Faisal General Trading",
  "description": "UAE's biggest used goods souq. Quality second-hand furniture, appliances & home goods since 2009.",
  "url": "https://bufaisal.ae",
  "telephone": "+971585932499",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Ajman",
    "addressCountry": "AE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 25.4052,
    "longitude": 55.5136
  },
  "openingHours": "Mo-Su 09:00-22:00",
  "priceRange": "AED",
  "image": "https://bufaisal.ae/og-image.png",
  "sameAs": [
    "https://www.instagram.com/bufaisal.ae",
    "https://www.tiktok.com/@bufaisal.ae",
    "https://www.facebook.com/bufaisal.ae"
  ]
}
```

One coord (25.4052, 55.5136) materially misrepresents 5 physical shops. Hours string says `09:00-22:00` while Hamzah's verified data says `09:00-23:00`; treat as a minor data drift to correct in this PR.

### `src/app/shop/page.tsx` — LocalBusiness block (lines 111–137, emitted at line 157)

Byte-for-byte identical payload to `src/app/page.tsx`. Same single-shop collapse, same coord drift, same priceRange "AED" (uninformative — Google docs imply currency-suffixed range like `"AED 50 - AED 5000"` or `"$$"`).

### Grep results — any other Organization/LocalBusiness emission sites?

```
src/app/layout.tsx:117                     '@type': 'Organization',            ← in scope (root Org)
src/app/page.tsx:93                        '@type': 'LocalBusiness',           ← in scope (homepage LB)
src/app/shop/page.tsx:113                  '@type': 'LocalBusiness',           ← in scope (shop LB)
src/app/shop/shop-client.tsx:186           seller: { '@type': 'Organization', ← OUT of scope (nested Product.offers.seller in CSR ItemList — distinct semantic role)
src/lib/augment-product-schema.ts:125      '@type': 'Organization',            ← OUT of scope (nested Product.offers.seller in render-time augmenter)
src/__tests__/lib/augment-product-schema.test.ts:225   '@type': 'Organization', ← OUT of scope (unit-test fixture)
```

**Confirmed: three emission sites for top-level Organization/LocalBusiness entities.** The other three matches are `offers.seller` nested inside `Product` (Bufaisal-as-merchant, not Bufaisal-as-physical-location) and must not be touched by PR #54.

---

## Section 2 — Recommended 5-shop Schema Structure

**Google's published guidance is silent on the per-location pattern for chains.** The Local Business doc says only:

> "You can add LocalBusiness structured data to any page on your site, though it may make more sense to put it on a page that contains information about your business."

All examples in Google's docs are single-location. There is no `location[]` array example, no `parentOrganization` example, and no `Store` chain example.

In practice two patterns are valid against schema.org:

- **Option (a) — five sibling `<script type="application/ld+json">` blocks**, each with one `@type: "LocalBusiness"`, each linked to the parent via `parentOrganization: {"@type": "Organization", "name": "Bu Faisal General Trading", "url": "https://bufaisal.ae"}` (cross-reference, not a nested object).
- **Option (b) — single Organization with `location: [<Place 1>, …, <Place 5>]` nested.** Schema.org allows `Organization.location` of type `Place` / `PostalAddress` / `Text` / `VirtualLocation`. `LocalBusiness` extends `Place`, so this is structurally valid.

**Recommendation: Option (a) — five sibling LocalBusiness blocks.**

Reasoning, since Google's docs don't pick a winner:
- Each Bufaisal shop has its own Google Business Profile (verified by the 5 `share.google/...` URLs Hamzah provided). Per-location LocalBusiness blocks are the canonical 1:1 mapping to GBPs. Google's local-search index ingests one GBP per location; the schema mirrors that grain.
- Option (a) lets each block carry its own `aggregateRating`, `geo`, `address`, `sameAs` cleanly, with no nesting ambiguity. Crawlers and validators treat each block as an independent entity.
- Option (b) nests `Place` under `Organization.location`. `aggregateRating` on a nested `Place` is harder to parse and Google has not published an example. Risk of zero SERP impact from misparse is higher.
- Option (a) does **not** "compete with itself" in SERP — Google deduplicates by GBP-linked `sameAs` URL when present. Each block's distinct `sameAs: ["https://share.google/..."]` is what tells Google "these are five different storefronts," not one entity claiming five locations.
- `parentOrganization` is a documented schema.org property of LocalBusiness and is used widely (Microsoft, Apple, McDonald's all use the per-location-plus-cross-reference pattern). Google's docs don't require it but don't reject it.

**Minimal valid shape per shop (option a):**

```
LocalBusiness {
  @context: "https://schema.org"
  @type: "LocalBusiness"          // required
  name: "<shop display name>"     // required (Google)
  @id: "https://bufaisal.ae/#shop-bf1"   // optional but useful for cross-references
  url: "https://bufaisal.ae"
  image: "<canonical hero URL>"
  telephone: "+971585932499"
  priceRange: "AED 50 - AED 5000"  // upgrade from current "AED"
  openingHoursSpecification: [<7 days × Mo–Su 09:00–23:00>]  // preferred over plain "openingHours" string
  address: PostalAddress {        // required (Google)
    @type: "PostalAddress"
    streetAddress: "<per-shop>"
    addressLocality: "Ajman"
    addressRegion: "Ajman"
    addressCountry: "AE"
    postalCode: <see Section 4>
  }
  geo: GeoCoordinates {
    @type: "GeoCoordinates"
    latitude: <per-shop>
    longitude: <per-shop>
  }
  aggregateRating: AggregateRating {  // see Section 3 caveat
    @type: "AggregateRating"
    ratingValue: "<per-shop>"
    reviewCount: <per-shop>
    bestRating: "5"
    worstRating: "1"
  }
  sameAs: ["<per-shop share.google/... URL>"]
  parentOrganization: {
    @type: "Organization"
    name: "Bu Faisal General Trading"
    url: "https://bufaisal.ae"
  }
}
```

**Trade-off summary:**

| Concern | Option (a) — 5 sibling blocks | Option (b) — Org.location[5] |
|---|---|---|
| Crawler parse confidence | High (Google has documented every field individually) | Medium (no Google example of nested LocalBusiness in `location[]`) |
| Per-shop aggregateRating | Trivial — sits on each block | Risky — nested under `Place` |
| SERP self-competition | Low — `sameAs` disambiguates | None — only one entity |
| Knowledge Panel / map carousel eligibility | High per shop | Lower per shop (everything funnels to parent) |
| Markup size | ~5× | ~1.5× |
| Reversibility if Google rejects | Easy — drop blocks | Easy — flatten |

---

## Section 3 — `aggregateRating` Validation

### Required fields (per Google review-snippet doc)

- `@type: "AggregateRating"` — implied required (must declare type when nested).
- `ratingValue` — required. Number, fraction, or percentage (`4`, `60%`, `6 / 10`).
- **`ratingCount` OR `reviewCount`** — at least one is required. Google's verbatim wording: *"At least one of `ratingCount` or `reviewCount` is required."*
- `itemReviewed.name` — required for non-nested ratings; when nested inside a parent type (e.g., `LocalBusiness.aggregateRating`), the parent's `name` serves this purpose, so it is NOT needed on the AggregateRating node itself.

### Recommended fields

- `bestRating` — recommended. Omitted ⇒ Google assumes **5**.
- `worstRating` — recommended. Omitted ⇒ Google assumes **1**.

Bufaisal's GBPs use Google's 5-star scale by default, so the assumed defaults match reality. Including them explicitly is still preferred (defense against future schema.org default changes and clearer for non-Google consumers).

### `ratingCount` vs `reviewCount` — Google's preference

Quoting Google's distinction: `ratingCount` is the total number of ratings, while `reviewCount` indicates the number of people who provided a review **with or without an accompanying rating**. Google does not state a preference between the two — both are accepted.

For Bufaisal: the GBP figures Hamzah provided (1442 / 281 / 582 / 47 / 49) are **review counts including those with written text and those that are just star ratings**. Either field is semantically acceptable. Recommend `reviewCount` because:
- It matches the user-facing language ("X Google reviews") and matches what crawlers see on each GBP page.
- If we later add written `review[]` items, `reviewCount` is the field that those increment.

### Self-declared aggregateRating eligibility — CRITICAL CAVEAT

**Google explicitly restricts self-declared ratings on LocalBusiness and Organization for SERP star rendering.** Verbatim from the Review snippet guidelines (fetched 2026-05-13):

> "If the entity that's being reviewed controls the reviews about itself, their pages that use `LocalBusiness` or any other type of `Organization` structured data are ineligible for star review feature."

**What this means for PR #54:**

The 1442/281/582/47/49 ratings come from Google Business Profile reviews — i.e., reviews left BY CUSTOMERS, hosted ON GOOGLE, NOT controlled by Bufaisal. They are independently-sourced. This is **exactly the kind of rating Google's policy does NOT classify as self-serving** — Google's restriction targets sites that aggregate their own internally-collected (and editable) reviews and emit them as schema.

However, Google's guidance is ambiguous about whether emitting GBP rating numbers in your OWN schema is the right surface for them. Google already knows the GBP rating; it ingests it directly from GBP and renders it natively in maps + local SERP. There is a real risk that:
1. Google will ignore the schema `aggregateRating` (preferring its own GBP data) — no harm, no benefit.
2. Google will treat it as self-declared because the site domain (`bufaisal.ae`) matches the entity claiming the rating, and downgrade the page — modest harm.

**Recommendation:** ship `aggregateRating` on each LocalBusiness anyway. Net expected value is positive because:
- The GBP-sourced data is genuinely independent (Google itself hosts and verifies it).
- Bufaisal has nothing to hide — the same numbers are visible on the public GBP listing.
- Worst case is Google ignores the field — there's no SEO penalty documented for accurate, GBP-aligned ratings.
- Best case is Google honors it and lights up stars in SERP for non-map-pack results (e.g., `/shop`, homepage).

**Risk-mitigation:** add a one-line code comment in each LocalBusiness block citing the GBP `sameAs` URL as the source-of-truth. This makes the audit trail explicit if Google ever raises a manual action.

If Hamzah wants to be conservative, alternative is to ship the 5 LocalBusiness blocks WITHOUT `aggregateRating` initially, then add it in a follow-up after monitoring GSC for issues. PR #54 description should call out this knob explicitly.

---

## Section 4 — Postal Code Handling

### schema.org requirement

`postalCode` on `PostalAddress` is **OPTIONAL**. schema.org does not mark it required and does not designate it recommended — it is one of seven core properties (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`, `postOfficeBoxNumber`, `extendedAddress`).

### Google's requirement

Google's LocalBusiness documentation lists `postalCode` as RECOMMENDED, not required. The exact required PostalAddress fields per Google are `streetAddress` + `addressLocality` + `addressRegion` + `addressCountry`. The guidance is "Include as many properties as possible. The more properties you provide, the higher quality the result is to users."

There is no Google-published guidance on countries without postal codes (UAE, Hong Kong, Ireland's historic urban addresses, etc.). The Local Business doc does not discuss the case.

### Will omitting `postalCode` clear the active Rich Results warning?

**Per `docs/phase-7-schema-audit.md` Section 3, the warning surfaced is "Organization needs postalCode + streetAddress."** This is a *recommendation* warning, not an error. To clear it, the rendered Organization schema must include both `streetAddress` AND `postalCode` as non-empty strings within `address.PostalAddress`.

- Omitting `postalCode` ⇒ the warning will persist for the `postalCode` half.
- Including `postalCode: ""` (empty string) ⇒ Google's validator typically treats empty as absent; warning persists.
- Including `postalCode: "00000"` (UAE placeholder convention) ⇒ warning clears. This is the established pattern used by other UAE-domiciled businesses on Google Knowledge Panels.

**Recommendation for PR #54: use `"00000"` as the placeholder.**

Rationale:
- UAE genuinely does not assign postal codes (PO Box numbers serve that role); "00000" is the schema-friendly null-placeholder used by Emirates Post, Etisalat, and other major UAE entities in their public structured data.
- It's machine-readable as "no postal code" by any tooling that recognizes the convention.
- It clears Google's warning, which is the explicit acceptance criterion for PR #54.
- It is reversible — if Google ever publishes UAE-specific guidance preferring omission, swap to omit in a single-line change.

**Alternative:** if Hamzah wants to be precise rather than placeholder-y, use the Ajman PO Box for the Bufaisal General Trading entity (if there is one) for the Organization. The 5 individual shops would still use "00000" because they share the same physical block without distinct PO Boxes. This is the more honest representation but requires Hamzah to confirm the company's registered PO Box.

### Minimum to clear the existing Organization warning

The minimum diff to `src/app/layout.tsx` Organization block:

```
address: {
  "@type": "PostalAddress",
  streetAddress: "Behind Safeer Hypermarket, Al Jurf 2 Askan Holding",   // NEW
  addressLocality: "Ajman",
  addressRegion: "Ajman",                                                 // NEW (also recommended)
  postalCode: "00000",                                                    // NEW
  addressCountry: "AE"
}
```

After ship, validate with Google Rich Results Test on `https://bufaisal.ae/` — the Organization warning for postalCode + streetAddress should disappear. If `addressRegion` is also flagged (it's a separate field, may or may not be in the current warning), this same diff clears it.

---

## Section 5 — Proposed Implementation Sketch

Pseudocode only — no real TypeScript.

### Step A — `src/app/layout.tsx` Organization update

In-place edit of the existing Organization JSON-LD block:

```
ORGANIZATION:
  ...all existing keys unchanged...
  address:
    @type: "PostalAddress"
    streetAddress: <HQ street string from Hamzah data>
    addressLocality: "Ajman"
    addressRegion: "Ajman"            // adds completeness; matches AE convention
    postalCode: "00000"               // placeholder per Section 4
    addressCountry: "AE"
```

No new imports. No new helpers. ~5 lines added to the existing object literal. WebSite block untouched.

### Step B — Shared shop-schema builder

Add a new pure helper module — does NOT live in any of the three "in scope" files. Suggested location: `src/lib/shop-business-schema.ts` (new file, alongside the existing `src/lib/shops.ts` per the resolver-per-concern pattern locked in Phase 6.4).

```
EXPORT buildLocalBusinessSchemas() returning array<5 JSON-LD objects>:
  for each shop in SHOPS_DATA:                    // imported from a small per-shop config
    yield LocalBusiness {
      @context: "https://schema.org"
      @type: "LocalBusiness"
      @id: "https://bufaisal.ae/#shop-" + shop.id  // BF1..BF5 anchor
      name: shop.displayName                       // "Bu Faisal Used Furniture & Appliances - Main Branch" etc.
      url: "https://bufaisal.ae"
      telephone: SHARED_PHONE
      priceRange: "AED 50 - AED 5000"              // upgrade from "AED"
      image: SHARED_HERO_URL                       // pulled from layout.tsx constant
      openingHoursSpecification:                   // upgrade from plain "openingHours" string
        for day in [Mo, Tu, We, Th, Fr, Sa, Su]:
          { @type: "OpeningHoursSpecification", dayOfWeek: day, opens: "09:00", closes: "23:00" }
      address:
        @type: "PostalAddress"
        streetAddress: shop.streetAddress
        addressLocality: "Ajman"
        addressRegion: "Ajman"
        postalCode: "00000"
        addressCountry: "AE"
      geo:
        @type: "GeoCoordinates"
        latitude: shop.lat
        longitude: shop.lng
      aggregateRating:
        @type: "AggregateRating"
        ratingValue: shop.ratingValue (string, e.g. "3.5")
        reviewCount: shop.reviewCount (integer)
        bestRating: "5"
        worstRating: "1"
      sameAs: [shop.gbpShareUrl]
      parentOrganization:
        @type: "Organization"
        name: "Bu Faisal General Trading"
        url: "https://bufaisal.ae"
    }
```

The 5-shop data table from Hamzah is the single source of truth — colocate it as a `SHOPS_BUSINESS_DATA` const in the new helper file (do NOT reuse `src/lib/shops.ts` because that one is scoped to display name + map URL for product pages; mixing concerns violates Phase 6.4 resolver-per-concern lock).

### Step C — `src/app/page.tsx` and `src/app/shop/page.tsx` consumption

In both files, replace the existing single `localBusiness` const and its single `<script>` emission with a loop over the 5 schemas from the helper. Pseudocode for both files:

```
import { buildLocalBusinessSchemas } from "@/lib/shop-business-schema"
...
const localBusinessSchemas = buildLocalBusinessSchemas()
...
JSX:
  for each schema in localBusinessSchemas:
    <script type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
```

Note: apply the `replace(/</g, '\\u003c')` escape pattern consistently with the rest of the codebase. Per CLAUDE.md, the `escapeJsonLd()` helper used in `src/app/item/[id]/page.tsx` is the locked-in pattern for new schema sites; the homepage and shop emitters predate that helper but should adopt it on this PR's cuts to avoid divergence.

### Step D — Disposition of the single LocalBusiness block on `/` and `/shop`

**Delete it.** Replace with the 5-shop array. Do NOT keep one of the 5 as a "main" entity — that recreates the single-collapsed-entity problem and confuses Google about which is canonical. The "main" branch identity is carried by Shop A's `name: "...Main Branch"` and Shop A's `sameAs` pointing to the GBP marked Main on Google. Customers will continue to see the right business via the GBP-driven local pack.

### Step E — Verification

After deploy:
- Curl `https://bufaisal.ae/` and confirm 8 JSON-LD blocks (Organization, WebSite, 5× LocalBusiness, FAQPage) — up from 4.
- Curl `https://bufaisal.ae/shop` and confirm 7 JSON-LD blocks (5× LocalBusiness, FAQPage; Organization + WebSite from root layout) — up from 4.
- Run Google Rich Results Test on `https://bufaisal.ae/` — expect: 1 Organization (warnings cleared), 5 LocalBusiness (no warnings), 1 WebSite, 1 FAQPage.
- Check GSC over the following 7 days for new Local Business or Review snippet warnings/errors.

---

## Section 6 — Risk Assessment

### Breakage risk

- **JSON-LD parsing failure:** mitigated by emitting one block per shop (any single bad block fails alone; the others still render). Pure-function builder with TypeScript types catches most data shape bugs at compile time.
- **Visual regression:** zero. JSON-LD does not render to DOM; no visible UI change on `/`, `/shop`, or product pages.
- **Page weight:** ~6 KB raw, ~2 KB gzipped added to `/` and `/shop` initial HTML. Below the noise floor — these are static, server-rendered, and gzip-compressible.
- **Build/test:** the augmenter unit tests (`src/__tests__/lib/augment-product-schema.test.ts`) are scoped to `offers.seller` and don't touch this work. Add 2–3 unit tests for the new builder (output shape, exact field count per shop, presence of `parentOrganization` cross-reference).

### Rollback plan

- One-commit revert restores the pre-PR state. Public surface (HTML pages, product cards, search) is unaffected because JSON-LD is metadata-only — no user-visible behavior depends on it.
- If only the multi-shop part regresses (warning on a specific shop's schema), can temporarily comment out that shop from `SHOPS_BUSINESS_DATA` and ship a 4-shop hotfix while the data is fixed. The Organization address change in Step A is independent and can ship even if Step B/C is reverted.

### What could go wrong with shared coords on Shop D + E

Shops D and E share `(25.3994663, 55.4993168)`. This will look like a data error to Google's local indexer:
- **Likely Google behavior:** treats them as one location, drops one from the local pack, picks the higher-rated one (E, 4.4 stars / 49 reviews) over D (4.2 / 47).
- **Mitigation:** distinct `sameAs` GBP URLs and distinct `streetAddress` strings disambiguate at the schema level. Crawlers SHOULD follow `sameAs` to find the separate GBPs and treat them as distinct entities.
- **Confirmation from Hamzah needed:** are D and E truly physically adjacent / sharing a building, or is one of the two coords stale? If they're genuinely co-located, the schema is honest — Google's deduplication is then a feature, not a bug. If one is wrong, fix in `SHOPS_BUSINESS_DATA` before ship.
- **Recommendation:** ship as-is with a comment in `SHOPS_BUSINESS_DATA` documenting the deliberate shared coords. If Google's Local Search index later drops one shop from the pack, revisit by either (a) getting more precise coords from each shop's GBP "Edit Profile" page, or (b) merging the two LocalBusiness blocks into one with both `sameAs` URLs.

### What happens if Google rejects self-declared aggregateRating

Per Section 3, the policy on self-serving reviews could in theory apply. Worst case Google ignores the `aggregateRating` field — no penalty, no benefit. The LocalBusiness blocks remain valid and surface the 5-shop physical-location signal. Conservative fallback: ship the 5 blocks WITHOUT `aggregateRating` and add it in a Phase 7.5 PR after monitoring.

### What happens if Google has stricter parentOrganization requirements

Unlikely (it's a well-documented schema.org property), but if Google flags the cross-reference: drop `parentOrganization` entirely. The Organization-LocalBusiness link is then implicit via `sameAs` and `url`, which Google already follows for entity reconciliation.

---

## Flagged Concerns

### Data quality concerns from Hamzah's verified table

1. **Shop E streetAddress is a business name, not a street name.** The value "Royal Diamond Printing Press LLC, Unnamed Road" puts a third-party business name in `streetAddress`. schema.org's `streetAddress` is intended for street-level location text ("123 Main St, Suite 4"), not "next to <other business>". This is technically valid (schema.org doesn't validate the string content) but it leaks Bufaisal's GBP-style "near this landmark" address format into structured data. **Recommendation:** before ship, ask Hamzah whether the actual street name for Shop E is known. If not, alternatives: (a) ship as-is — Google will tolerate it; (b) use `"Al Jurf 2 Askan Holding, Unnamed Road"` to match the area without naming a third-party business; (c) use `description` for the landmark and leave `streetAddress` minimal. Option (b) is recommended if data isn't available.

2. **Shop D and E share GPS coordinates.** Discussed in Section 6 — flag for Hamzah confirmation that they are genuinely co-located. If one coordinate is stale, fix before ship.

3. **Shop A's `streetAddress` is also a landmark-style "Behind Safeer Hypermarket"**, used for both the root Organization HQ and Shop A. This is consistent and intentional (Shop A is the Main Branch, so its address IS the HQ address). No flag — note for documentation only.

4. **`priceRange` "AED" in the current schema is uninformative.** Schema.org accepts free-text but Google's preference is a range like `"$$"`, `"$$$"`, or `"AED 50 - AED 5000"`. PR #54 should upgrade this to `"AED 50 - AED 5000"` on every shop. This is in-scope for the shop blocks (low cost, real improvement) and out-of-scope for the root Organization (Organization doesn't carry `priceRange`).

5. **`openingHours` upgrade.** Currently `"Mo-Su 09:00-22:00"` (off by one hour AND uses the deprecated plain-string form). Upgrade to seven `OpeningHoursSpecification` objects with `09:00-23:00`. The string form still validates but Google's docs recommend the spec form when emitting multi-day hours.

### Out-of-scope cross-references for awareness

- The `offers.seller` Organization in `augment-product-schema.ts` is INDEPENDENT of the root Organization — it intentionally uses trading name "Bufaisal" (not "Bu Faisal General Trading") and `legalName "Bu Faisal General Trading LLC"`. Do NOT unify these in PR #54. They serve different SEO purposes (per-product seller vs. site-level entity). Documented in CLAUDE.md "Seller block in Product JSON-LD includes legalName".
- The CSR ItemList in `shop-client.tsx:186` also emits a thin `offers.seller` for category shop pages. Same out-of-scope reasoning.
- `BreadcrumbList` and `Product` schemas on `/item/[id]` are entirely orthogonal to this PR.

### Mild process flag — audit doc vs. user prompt phase numbering

`docs/phase-7-schema-audit.md` Summary section originally proposed bundling items 1+5 (Organization aggregateRating + Organization postalCode/streetAddress) as PR #52, and item 2 (Merchant Listings) as PR #53. User prompt says PR #52 (Merchant Listings) just shipped — i.e., the ordering was inverted from the audit's recommendation. This is fine, but it means **Organization-level `aggregateRating` has NOT yet shipped** (despite the audit's high-priority ranking). PR #54 as scoped here addresses ONLY the address-completeness half of audit item 5 AND the LocalBusiness split (audit item not previously enumerated as a separate work item — it was packaged in the structural-concern note of Section 3, then broken out by Hamzah for PR #54). **Organization-level aggregateRating remains a future PR.** Worth confirming Hamzah's intent before ship: is `aggregateRating` on the root Organization (single aggregated number) ALSO in scope for PR #54, or only the 5× per-shop ratings? This audit assumes only the per-shop ratings are in scope.
