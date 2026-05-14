# PR #53 Pre-Audit — Merchant Listings Eligibility
Date: 2026-05-13

Scope: add `shippingDetails` + `hasMerchantReturnPolicy` to the Product JSON-LD via `augmentProductSchema()` so the 49 published products become eligible for Google's "Merchant listing" rich result. No DB migration, no AI prompt change. Pure render-time augmentation.

---

## Section 1 — Current Augmenter State

**File:** `src/lib/augment-product-schema.ts` (79 LOC, pure function, no I/O).

### Imports
None. Zero external dependencies — pure data transform.

### Input context (`AugmentProductSchemaContext`)
- `sku: string | null` — sourced from `item.ai_barcode_extracted` at the call site.
- `url: string` — canonical `https://bufaisal.ae/item/{id}`.
- `category: string | null` — sourced from `resolvePublicItemFields(item).category` (i.e. `published_category ?? category`).
- `negotiable: boolean | null` — sourced from `item.admin_negotiable ?? item.worker_negotiable`.

### Fields currently augmented (top-level on `Product`)
1. `sku` — added only if context.sku present AND key absent in stored schema.
2. `url` — added only if key absent.
3. `category` — added only if context.category present AND key absent.

### Fields currently augmented (under `Offer`)
4. `offers.seller` — added only if absent; literal `{ '@type': 'Organization', name: 'Bufaisal', legalName: 'Bu Faisal General Trading LLC' }`.
5. `offers.url` — added only if absent.

### Description-level mutation
6. `description` — idempotent append of `"Price is negotiable."` when `negotiable === true` AND the string isn't already present.

### Conditionals
- Returns `null` immediately if input schema is null/undefined.
- Top-level adds use `next.<key> === undefined` (non-destructive — never overwrites).
- `offers` augmentation requires `offers` to be a present object AND NOT an array (multi-variant offers are explicitly skipped).
- All adds are "fill the gap, never overwrite."

### Category check presence
**No category check exists today.** The category is propagated as a flat string into `next.category` but there is no branching on its value. PR #53 will introduce the **first** category-aware branch in this file (for the 7-day-vs-as-is return policy decision).

---

## Section 2 — Category Field Availability

### Call site
`src/app/item/[id]/page.tsx:101-106`

```ts
const f = resolvePublicItemFields(item);
const productSchema = augmentProductSchema(f.productSchema, {
  sku: item.ai_barcode_extracted,
  url: canonicalUrl,
  category: f.category,           // <-- canonical category at augment time
  negotiable: item.admin_negotiable ?? item.worker_negotiable,
});
```

### Field name and source
- **Available as:** `context.category` (already in the augmenter's signature).
- **Source:** `resolvePublicItemFields(item).category` = `item.published_category ?? item.category` (`??`, not `||`).
- **Pre-Phase-6.5 rows:** read from the legacy `category` column.
- **Post-6.5 rows:** read from `published_category`.

### Canonical category strings
Confirmed at `src/lib/constants.ts:29` — the literal is `'Appliances'` (capital A, plural, no trailing words). Matches the user-supplied policy spec. The eight canonical categories all live in `constants.ts` `CATEGORIES`.

### Sample legacy row
The reference Hitachi row (`4cea5546-1da6-48cb-b6c2-bf7a61232278`, CLAUDE.md verified) has `published_category = 'Appliances'`. Whatever PR #53 ships, that row is the primary smoke-test target.

### Conclusion
Category is **already** in the augmenter's signature today; no plumbing change required at the call site. PR #53 only needs to branch inside the augmenter on `context.category === 'Appliances'`.

---

## Section 3 — Google Required Shapes

### Placement (Offer vs Product)

**Both `shippingDetails` and `hasMerchantReturnPolicy` nest under `Offer`**, not at top-level Product.

- Path: `Product.offers.shippingDetails` (type `OfferShippingDetails`).
- Path: `Product.offers.hasMerchantReturnPolicy` (type `MerchantReturnPolicy`).

Source: developers.google.com merchant-listing structured-data doc — *"Nested information about the shipping policy associated with an Offer"* / *"Nested information about the return policies associated with an Offer."*

Status: both fields are **recommended** (not strictly required), but they are required for Merchant Listing rich-result eligibility — i.e. Google won't surface the snippet without them.

This matches our existing pattern: `augmentProductSchema()` already augments `offers.seller` and `offers.url`. The same in-offer-block path holds for the two new fields.

### shippingDetails — minimal valid shape

`shippingRate` (single `value` + `currency`, **not** min/max) and `shippingDestination` are the minimal must-haves. `deliveryTime` is recommended.

```json
{
  "@type": "OfferShippingDetails",
  "shippingRate": {
    "@type": "MonetaryAmount",
    "value": 50,
    "currency": "AED"
  },
  "shippingDestination": {
    "@type": "DefinedRegion",
    "addressCountry": "AE"
  },
  "deliveryTime": {
    "@type": "ShippingDeliveryTime",
    "handlingTime": {
      "@type": "QuantitativeValue",
      "minValue": 0,
      "maxValue": 0,
      "unitCode": "DAY"
    },
    "transitTime": {
      "@type": "QuantitativeValue",
      "minValue": 0,
      "maxValue": 1,
      "unitCode": "DAY"
    }
  }
}
```

Field-by-field notes:
- `shippingRate.value` — **MUST be a single number**. Google's `MonetaryAmount` for shipping does **not** accept `minValue` / `maxValue` (those are only valid on `QuantitativeValue` for time durations). The AED 50–500 range is **not directly expressible** here — see Flagged Policy Concerns.
- `shippingRate.currency` — ISO 4217 code, `"AED"` for UAE Dirham.
- `shippingDestination.addressCountry` — ISO 3166-1 alpha-2; `"AE"` for UAE. Country-only is sufficient (no `addressRegion` needed since we deliver to all 7 emirates uniformly).
- `deliveryTime.handlingTime` — min=0/max=0 days expresses "same-day order processing."
- `deliveryTime.transitTime` — min=0/max=1 days covers same-day delivery + next-day for far-emirate trips.
- `deliveryTime.unitCode` — UN/CEFACT code; `"DAY"` is the canonical unit.

### hasMerchantReturnPolicy — returns allowed (7-day, Appliances)

```json
{
  "@type": "MerchantReturnPolicy",
  "applicableCountry": ["AE"],
  "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
  "merchantReturnDays": 7,
  "returnMethod": "https://schema.org/ReturnInStore",
  "returnFees": "https://schema.org/FreeReturn"
}
```

Field notes:
- `applicableCountry: ["AE"]` — array form is the doc's canonical pattern.
- `returnPolicyCategory: MerchantReturnFiniteReturnWindow` — the 7-day window.
- `merchantReturnDays: 7` — required when category is `MerchantReturnFiniteReturnWindow`.
- `returnMethod: ReturnInStore` — fits Bufaisal's physical-shop model (customer returns to one of the 5 Ajman shops). `ReturnByMail` would misrepresent the actual workflow.
- `returnFees: FreeReturn` — Bufaisal does not charge a fee for returns within the 7-day window for appliances.

### hasMerchantReturnPolicy — as-is (non-Appliances)

```json
{
  "@type": "MerchantReturnPolicy",
  "applicableCountry": ["AE"],
  "returnPolicyCategory": "https://schema.org/MerchantReturnNotPermitted"
}
```

Field notes:
- When category is `MerchantReturnNotPermitted`, **only `returnPolicyCategory` is strictly required** (and `applicableCountry` for Merchant Listings). No `merchantReturnDays`, no `returnMethod`, no `returnFees`. Adding them would be a schema error.

### Range-pricing legality (AED 50–500)

**Not legal as a single `shippingRate.value`.** Google's `MonetaryAmount` for shipping accepts only a single `value` + `currency`. There is no documented mechanism for variable/range pricing, "contact for quote," or "varies by item" in Merchant Listing markup.

Options considered:
1. **Single representative rate** (e.g. `value: 50` as a floor) — minimum truth, won't get flagged, but understates worst case. Acceptable to Google.
2. **Free-shipping declaration** (`value: 0`) — false advertising; reject.
3. **Omit shippingDetails entirely** — disqualifies Merchant Listing eligibility; defeats PR's purpose.
4. **Multiple shippingDetails entries** keyed off different `shippingDestination` regions — the doc shows arrays of regions per single OfferShippingDetails (different rate per emirate, say), but we deliver uniformly across all 7 emirates so this doesn't model our reality.

**Recommendation:** ship single-value `value: 50` as the published "starting from" rate (matches how customers see it on WhatsApp: "shipping starts at AED 50"). Mention in the PR description that the AED 50–500 range is collapsed to floor-50 for schema purposes; the actual quote is given via WhatsApp negotiation. This is consistent with how second-hand marketplaces typically handle variable freight in Merchant Listings.

See Flagged Policy Concerns for the formal flag.

---

## Section 4 — Risk Assessment

### Breakage risk
**Purely additive.** Both fields nest under `offers` and are non-destructive guarded by the same `=== undefined` pattern the augmenter already uses for `seller` and `url`. No existing rich-result (Product snippets, FAQ, Breadcrumbs, Organization) shares these field names — zero collision.

The current 5-valid-rich-results state on the Hitachi reference row (Product snippets, Merchant listings warnings, Breadcrumbs, FAQ, Organization) should flip to 5 fully valid + Merchant listings promoted from "warnings" → "valid" after the change. No existing valid item should drop out.

### Test coverage
Test files exist at `src/__tests__/`:
- `middleware.test.ts`
- `lib/verify-origin.test.ts`
- `lib/appliance-catalog.test.ts`
- `lib/rate-limit.test.ts`
- `lib/constants.test.ts`
- `lib/diesel-calc.test.ts`
- `api/auth.test.ts`
- `api/gemini.test.ts`

**No existing tests for `augment-product-schema.ts`.** Recommendation: add `src/__tests__/lib/augment-product-schema.test.ts` in the same PR — pure function, easy to cover. Suggested cases:
1. Returns null on null/undefined input.
2. Adds `shippingDetails` and `hasMerchantReturnPolicy` under offers.
3. `category === 'Appliances'` → returns the 7-day finite-window policy.
4. `category !== 'Appliances'` (e.g. `'Bedroom & Sleep'`) → returns `MerchantReturnNotPermitted`.
5. `category === null` → falls back to `MerchantReturnNotPermitted` (conservative default).
6. Stored schema already has `shippingDetails` → augmenter does NOT overwrite.
7. Stored schema already has `hasMerchantReturnPolicy` → augmenter does NOT overwrite.
8. Stored schema has `offers` as an array → augmenter skips both adds (consistent with existing seller/url behavior).
9. Stored schema lacks `offers` entirely → augmenter does not fabricate offers.

### Rollback plan
- **No storage, no migration, no AI prompt change.** All output is computed at render time.
- Revert is a one-PR-revert on `src/lib/augment-product-schema.ts` (and the test file). Public site reverts to the current Phase 6.5 / 6.6 state on next deploy.
- No data needs to be re-published; the augmenter is invoked fresh on every request.
- Cache implication: Next's per-route cache may serve stale JSON-LD briefly. Force-revalidate `/item/[id]` after deploy if needed (existing cache-defeat pattern in CLAUDE.md applies).

---

## Section 5 — Proposed Implementation Sketch (PSEUDOCODE)

```
FUNCTION buildShippingDetails():
    RETURN object describing:
        - shippingRate: single value AED 50 (representative floor; see flag below)
        - shippingDestination: country AE only
        - deliveryTime: handling 0 days, transit 0–1 days

FUNCTION buildReturnPolicy(category):
    IF category equals "Appliances":
        RETURN MerchantReturnFiniteReturnWindow:
            - applicableCountry AE
            - 7 days
            - ReturnInStore
            - FreeReturn
    ELSE:
        // covers all 7 non-Appliances categories AND the null/unknown case
        RETURN MerchantReturnNotPermitted:
            - applicableCountry AE
            - returnPolicyCategory only

FUNCTION augmentProductSchema(schema, context):
    [existing top-level adds: sku, url, category — unchanged]

    IF offers is a present non-array object:
        offers = clone of next.offers

        [existing offer adds: seller, url — unchanged]

        IF offers.shippingDetails is undefined:
            offers.shippingDetails = buildShippingDetails()

        IF offers.hasMerchantReturnPolicy is undefined:
            offers.hasMerchantReturnPolicy = buildReturnPolicy(context.category)

        next.offers = offers

    [existing description negotiable hint — unchanged]

    RETURN next
```

Notes for the implementer:
- Build the two policy objects as **module-level constants where possible** (the shipping object is invariant; only the return-policy varies by category). Two flat objects `RETURN_POLICY_APPLIANCES` and `RETURN_POLICY_AS_IS` work well. The shipping object can be a single `SHIPPING_DETAILS` const since it never varies.
- Return new clones from the builder helpers (or `structuredClone`) to avoid the augmenter handing out a reference to a shared module-level object that downstream code could mutate. Defensive — current code paths don't mutate, but the augmenter's contract is "pure / non-leaking."
- Preserve the `Array.isArray(offers)` skip — multi-variant offers are still out of scope.
- No new imports needed; everything stays in the file.
- The "any fault on Bufaisal's end → replacement or exchange immediately" universal goodwill commitment is **not modeled** in the schema — see Flagged Policy Concerns.

---

## Flagged Policy Concerns

### 1. AED 50–500 range cannot be expressed in `shippingRate`
Google's `MonetaryAmount` for `shippingRate` accepts only a single `value` + `currency` — `minValue`/`maxValue` are not supported there (they're only valid on `QuantitativeValue` for time durations). No documented way to express "varies," "contact for quote," or "from X to Y" in Merchant Listing markup.

**Recommendation:** ship `value: 50` (the floor). Add a one-liner in the PR description and inline code comment that this is a deliberate floor representation — Bufaisal's actual quote is given via WhatsApp. The risk of Google flagging this as misleading is low because (a) we are representing the lowest real rate, not free shipping, and (b) the customer-facing CTA on every product page is a WhatsApp Negotiate button where the real quote is delivered.

Alternative for Hamzah to decide: use the **mid-point AED 275** or the **ceiling AED 500** if it's important to avoid under-promising. The floor (50) is the safest from a "Google misleading shipping" complaint perspective.

### 2. "Buyer inspects before purchase" doesn't map to a schema enum
The non-Appliances policy ("as-is, no returns — buyer inspects in shop before purchase") has no dedicated `returnPolicyCategory` enum capturing the "buyer-inspected" rationale. `MerchantReturnNotPermitted` is the closest fit and is technically correct (returns are not permitted), but it doesn't communicate the *reason* (in-shop inspection).

**Recommendation:** use `MerchantReturnNotPermitted` for non-Appliances. The "as-is" reasoning is communicated to customers via the trust signals copy and condition badges on the page — that's the right surface for nuance, not JSON-LD. Don't try to invent extra fields.

### 3. "Any fault on Bufaisal's end → replacement or exchange immediately" is not representable
This is a **goodwill commitment** about Bufaisal's customer service, not a return-policy primitive. The schema enums (`MerchantReturnFiniteReturnWindow`, `MerchantReturnNotPermitted`, `MerchantReturnUnlimitedWindow`) all describe customer-initiated return windows, not seller-initiated remediation for shipping/listing errors.

**Recommendation:** do not encode this in JSON-LD. It's correctly expressed in customer-facing copy (trust signals, FAQ schema, About page). Forcing it into a structured-data field that doesn't model it would risk Google flagging the markup as misleading.

### 4. `returnMethod: ReturnInStore` semantics
Bufaisal operates 5 physical shops in Ajman. `ReturnInStore` is the correct enum, but Google's documentation around `ReturnInStore` doesn't specify whether the return must go to the *originating* shop. Practical answer: Bufaisal can accept returns at any of the 5 shops since they share inventory backends. No schema field to express this — fine to leave at `ReturnInStore`.

### 5. The Organization-level shipping/return policy alternative
The Google docs note: *"We recommend you provide a global shipping policy and standard return policy under Organization markup instead, when applicable."* Bufaisal's shipping and return policies **are** site-wide invariants (category-modulo for returns). Hamzah may want to consider moving these to `Organization` JSON-LD at `src/app/page.tsx` (currently the Organization block lives in the homepage layout) in a follow-up PR.

For PR #53 the under-offer approach is the right starting point because (a) it's the path the Hitachi reference row's Merchant Listings warning currently points at, (b) it covers every product page including direct-link traffic that doesn't pass through the homepage, and (c) it allows the per-category branching that Organization-level can't do (the Organization schema would have to declare a single conservative policy for the whole catalog).

A future Phase 7 PR could **also** declare Organization-level policies as a redundancy belt-and-braces. Don't do both in one PR.
