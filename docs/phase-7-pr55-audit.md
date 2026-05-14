# PR #55 Pre-Audit — ItemList SSR Migration

Date: 2026-05-13
Branch read: `phase-7/pr-54-localbusiness-split`
Scope: Move the `ItemList` JSON-LD block emitted on `/shop` (and incidentally `/`, since both routes mount `ShopClient`) from client-side rendering to server-side, so the carousel schema is present in the initial HTML response.

---

## Section 1 — Current ItemList Emission (CSR)

### Source location

`src/app/shop/shop-client.tsx` (a `'use client'` component) — the `useMemo` block at lines 161–193 and the emission at lines 197–203.

### Exact JSON-LD block currently emitted

The `useMemo` returns `null` when gated; otherwise builds:

```js
{
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `Used ${catName} for Sale`,
  numberOfItems: items.length,
  itemListElement: items.slice(0, 10).map((item, i) => {
    const f = resolvePublicItemFields(item);
    return {
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: f.itemName,
        description: f.description || `Used ${f.itemName}`,
        url: `https://bufaisal.ae/item/${item.id}`,
        image: resolveItemImageUrl(item) ?? '',
        brand: { '@type': 'Brand', name: f.brand || 'Bu Faisal' },
        offers: {
          '@type': 'Offer',
          availability: 'https://schema.org/InStock',
          priceCurrency: 'AED',
          price: item.sale_price || 0,
          seller: { '@type': 'Organization', name: 'Bu Faisal General Trading' },
        },
        itemCondition: 'https://schema.org/UsedCondition',
      },
    };
  }),
}
```

Rendered via:

```jsx
{dynamicSchema && (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(dynamicSchema) }}
  />
)}
```

### Conditional gating

```js
if (!catName || items.length === 0) return null;
```

Two gates:
1. **`catName` truthy** — requires `activeCategory` to be a known slug in `CATEGORY_SLUG_MAP`. On the no-category view (`/shop` with no `?category=` query param), `activeCategory === ''` so `catName === ''` and **nothing is emitted**.
2. **`items.length > 0`** — empty result set yields no schema.

No `numberOfItems` minimum; emits even for a single item (so long as a category is selected). Capped at 10 elements via `.slice(0, 10)`.

### Field-by-element inventory (all-in-one pattern)

Per `ListItem` (inline `item` object):

| Field | Source | Notes |
|---|---|---|
| `@type` | constant `Product` | |
| `name` | `resolvePublicItemFields(item).itemName` | canonical reader |
| `description` | `f.description || \`Used ${f.itemName}\`` | uses `||` (intentional fallback for empty strings here, distinct from the `??`-only rule for public field reads) |
| `url` | `https://bufaisal.ae/item/${item.id}` | hardcoded host |
| `image` | `resolveItemImageUrl(item) ?? ''` | from `src/lib/item-image.ts` chain |
| `brand` | `{ '@type': 'Brand', name: f.brand || 'Bu Faisal' }` | |
| `offers.availability` | `https://schema.org/InStock` | |
| `offers.priceCurrency` | `AED` | |
| `offers.price` | `item.sale_price || 0` | raw legacy column read (NOT a `published_*` source) |
| `offers.seller` | `{ '@type': 'Organization', name: 'Bu Faisal General Trading' }` | |
| `itemCondition` | `https://schema.org/UsedCondition` | hardcoded — does not branch on `worker_condition_type` |

ItemList wrapper fields: `@context`, `@type=ItemList`, `name`, `numberOfItems`, `itemListElement`.

### CSR-only React hooks / state consumed

- `useState<ShopItem[]>(initialItems)` for `items` — initialized from SSR prop, mutated by client refetch.
- `useState(initialCategory)` for `activeCategory` — initialized from SSR query param, mutated on filter clicks.
- `useMemo([catName, items])` for the schema object — purely derivational; could run on the server given access to those two values.

Nothing inside the schema build touches `window`, `document`, or any browser-only API. The helpers `resolvePublicItemFields` and `resolveItemImageUrl` are pure (no `'use client'` directives on `src/lib/resolve-public-item-fields.ts` or `src/lib/item-image.ts`).

---

## Section 2 — Data Flow Analysis

### Prop shape from `shop/page.tsx`

```tsx
<ShopClient initialItems={items} initialCategory={category || ''} />
```

Two props:
- `initialItems: ShopItem[]` — populated by `getItems(category, q)` server-side via Supabase, limit 50, filtered by `is_published=true && is_sold=false && is_hidden=false` and (optionally) `published_category` + ilike search.
- `initialCategory: string` — raw slug from `?category=`.

### SSR availability of items

Items **are** already available at SSR time on `shop/page.tsx`. The page is `dynamic = 'force-dynamic'` (line 9) with `revalidate = 60`, runs `await getItems(...)` (line 109) before returning JSX. The same query the client would run is already executed server-side. The CSR `fetchItems` is the same query body re-run after hydration when filters change.

### URL params

`shop/page.tsx` reads `searchParams.category` and `searchParams.q` server-side. `ShopClient` re-reads them via `useSearchParams()` plus its own state. Sort (`sortBy`) is client-only and **never round-trips to the URL** — sort changes don't trigger a server re-render.

| Param | Readable at SSR? | Triggers client refetch? |
|---|---|---|
| `category` | yes (`searchParams.category`) | yes (Next router replace + useEffect on `fetchItems`) |
| `q` | yes (`searchParams.q`) | yes (same path) |
| `sortBy` | no (purely client state) | no — re-orders the same array client-side? Actually re-runs `fetchItems` via `useCallback` dep, but the query body ignores `sortBy` (only orders by `is_featured`, `created_at`). So changing sort triggers a redundant refetch but no semantic difference. |

### Drift risk between SSR items and CSR refetch

`ShopClient` has a `hasMounted` guard (lines 132–140) that **suppresses the first refetch** so the initial render uses the SSR-provided `initialItems` as-is. Any subsequent filter/search/sort change triggers `fetchItems()` which replaces `items` state.

**Practical implication for SSR ItemList:** the SSR schema and the user's eventual client-filtered view can diverge once they click a category bubble. Googlebot crawling the URL `/shop?category=appliances` will see SSR items for `appliances` filtered with the same query the server would run — these match. Users navigating client-side via the bubble bar then drift, but bots crawl by URL so the rendered HTML they index always corresponds to the query string.

### Homepage (`src/app/page.tsx`)

Yes, the homepage **also mounts `ShopClient`** with `basePath="/"` (line 134–138). Same `getItems()` query, same `initialItems` prop shape. Same SSR data availability. The same SSR-ItemList strategy mechanically applies. Hamzah needs to decide whether to emit on `/` (see Section 7).

Note: `shop-client.tsx` line 232 already has different breadcrumb behavior for `basePath === '/'` (the home variant only renders breadcrumb when a category is active). The schema-emission gate `if (!catName || items.length === 0) return null;` is the same on both routes, so today the home view at `/` (no `?category=`) emits no ItemList; the home view at `/?category=appliances` does emit one.

---

## Section 3 — SSR Feasibility

### Lift-and-shift viability

**Viable with no architectural blockers.** The current schema-build code is pure: no React state, no browser APIs, no client-only modules. Every input to the schema is already available on the server:

| Input | Server availability |
|---|---|
| `items` array | already fetched in `shop/page.tsx::getItems()` |
| `catName` | `CATEGORY_SLUG_MAP[category]` — `CATEGORY_SLUG_MAP` is already imported by `shop/page.tsx` (line 5) and `page.tsx` (line 5) |
| `resolvePublicItemFields(item)` | pure, in `src/lib/resolve-public-item-fields.ts`, no `'use client'` directive — safe to import server-side |
| `resolveItemImageUrl(item)` | pure, in `src/lib/item-image.ts`, no `'use client'` directive — safe to import server-side |

### Blockers

None. Every dependency the schema build relies on is server-safe.

### No-category case gap

CSR emission currently requires `catName` truthy → on `/shop` (no `?category=`) and on `/` (no `?category=`), **no ItemList is emitted at all**. The audit calls this out as a gap because:
- the SSR `getItems()` always returns up-to-50 visible items even without a category, so the server has data to emit an "all items" list
- a "Browse all items" or "Used goods at Bu Faisal" ItemList on the un-filtered `/shop` is reasonable schema content
- but Google's docs (Section 4) don't explicitly support Product carousels at all, so adding one for an undifferentiated all-shop page may not improve indexing

Section 5 keeps the current gate (no `catName` → no schema) by default to preserve behavior. Section 7 raises the open question.

### Will the SSR script tag work?

Yes — `shop/page.tsx` and `page.tsx` already emit JSON-LD via `<script type="application/ld+json" dangerouslySetInnerHTML={...} />` server-side (LocalBusiness + FAQ — lines 129–141 and 106–118 respectively). The pattern is established; we add a third emission alongside.

---

## Section 4 — Google ItemList + Carousel Requirements

Sources fetched 2026-05-13:
- `https://developers.google.com/search/docs/appearance/structured-data/carousel`
- `https://schema.org/ItemList`
- `https://developers.google.com/search/docs/appearance/structured-data/product`

### Carousel rich-result eligibility

> "To be eligible for a host carousel rich result for your site, add `ItemList` structured data in combination with one of the following supported structured data features: **Course list, Movie, Recipe, Restaurant**."

**Product is NOT listed** as a supported carousel content type in Google's carousel docs. Critical finding: the current schema's likely SEO contribution is to **understanding** ("this page lists products") rather than to a literal "carousel" rich result in SERPs.

### Two ListItem patterns Google documents

**Summary page pattern** (each list element points to a separate detail page):
- `position` (1-indexed integer)
- `url` (URL to the detail page)

**All-in-one pattern** (single page with anchors):
- `position`
- `item` — full nested object including type-specific properties

Quote from carousel docs (paraphrasing the fetched extract):
> "**Summary Page Pattern** (separate detail pages): position (Integer, 1-based), url (URL to detail page). **All-in-One Pattern** (single page with anchors): position (Integer), item (full nested object with name, url, and type-specific properties)."

### Required ItemList fields per Google

- `itemListElement` — array of at least 2 ListItem objects, all the same type.

### Recommended ItemList fields per schema.org

- `itemListOrder`
- `numberOfItems` — **recommended, not required**. Schema.org notes "`numberOfItems` would be for the entire list" even when pagination limits what's displayed (i.e. it can exceed the array length).
- `name`

### `item` property accepts URL strings OR full Thing/Product objects

Schema.org quote (from `/ItemList` doc):
> "ListItem is used with ordered lists when you want to provide additional context about the element in that list or when the same item might be in different places in different lists."

The `item` field accepts both a URL string and a full nested object. Example shape from schema.org with `numberOfItems: "315"` and nested `Product` with `name`, `image`, `offers`.

### Google's recommendation for e-commerce category page carousels

**Google does not explicitly endorse the all-in-one Product-nested pattern for e-commerce category pages.** The carousel doc omits Product entirely. The product structured data doc has no specific guidance for combining ItemList with Product on listing pages. The product doc recommends "as much rich product information as available" generally.

**Practical interpretation:** Either pattern is structurally valid per schema.org. The current Bufaisal implementation uses the all-in-one pattern, which gives Googlebot maximum context per list element. Switching to URL-only would shrink the schema (~80% smaller payload) but rely on Googlebot to fetch each detail page (which it already does for individual Product/Merchant schema). Most SEO guides for shop category pages recommend the URL-only pattern when each item already has its own indexable Product schema, because it avoids data duplication that could confuse Google about which page is canonical for a given Product.

### Minimum carousel-eligible shape

For a non-Product type that IS supported (Course/Movie/Recipe/Restaurant):
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "url": "https://..." },
    { "@type": "ListItem", "position": 2, "url": "https://..." }
  ]
}
```

For Product, no "carousel rich result" is documented; the schema still provides crawl/understanding signals but won't render as a Google carousel widget.

---

## Section 5 — Proposed Implementation Sketch

PSEUDOCODE only. Not real TypeScript.

### Step 1 — New helper module: `src/lib/shop-item-list-schema.ts`

```
EXPORT function buildShopItemListSchema(items, catName):
  IF catName is empty OR items is empty:
    RETURN null

  RETURN {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Used ${catName} for Sale`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 10).map((item, i) =>
      buildListElement(item, i, catName)
    ),
  }

INTERNAL function buildListElement(item, index, catName):
  fields := resolvePublicItemFields(item)
  RETURN {
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'Product',
      ... same fields as today (name, description, url, image, brand, offers, itemCondition) ...
    },
  }
```

Pure module. No React. Mirrors the existing CSR logic exactly to keep diff minimal and avoid behavior change.

### Step 2 — `shop/page.tsx` emits the schema server-side

```
INSIDE the existing ShopPage server component, after `getItems` resolves:

  const catName = category ? CATEGORY_SLUG_MAP[category] : '';
  const itemListSchema = buildShopItemListSchema(items, catName);

INSIDE the existing <>...</> fragment, alongside the LocalBusiness and FAQ <script> tags:

  IF itemListSchema is not null:
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c'),
      }}
    />
```

Note: use the same `replace(/</g, '\\u003c')` escape the LocalBusiness emission already uses (defense-in-depth; matches Decisions Log JSON-LD safety rule).

### Step 3 — Remove the CSR emission from `shop-client.tsx`

```
DELETE the `dynamicSchema` useMemo (lines 161–193) and the emission block (lines 197–203).

DELETE the now-unused imports:
  - resolveItemImageUrl (only used by the deleted block)
  - useMemo (only used by the deleted block)

KEEP resolvePublicItemFields if it's used elsewhere in the file (it is not used elsewhere — also deletable if unused after the deletion; verify in the actual diff).
```

### Step 4 — Same migration on `src/app/page.tsx`

Same three steps applied to the homepage server component, since it also mounts `ShopClient` with the same data. Decision: emit on `/` exactly when emitting on `/shop` (i.e. same gate) so behavior is symmetric. Hamzah may decide to skip `/` — see Section 7.

### Step 5 — Verify

- Curl the SSR HTML for `/shop?category=appliances` and confirm a third `<script type="application/ld+json">` block appears with the ItemList payload BEFORE any JS executes.
- Curl the SSR HTML for `/shop` (no category) and confirm only the LocalBusiness + FAQ blocks appear (no ItemList — by design).
- Verify in browser DevTools that hydration does NOT add a second ItemList block (no duplicate emission).
- Run the Google Rich Results Test on a category URL and confirm "ItemList" + "Products" detection.

---

## Section 6 — Risk Assessment

### Risk 1 — Duplicate emission (HIGHEST)

**If we add SSR ItemList and DON'T remove the CSR block, Googlebot will see two `<script type="application/ld+json">` blocks of type `ItemList` on the same page.** That's a documented schema duplication bug; Google's docs warn against multiple JSON-LD blocks describing the same entity.

**Remediation:** the implementation MUST delete the CSR `dynamicSchema` block in the same PR. This is a non-negotiable atomic change. Reviewer checklist item: "verify `shop-client.tsx` no longer contains `'application/ld+json'`" before merging.

### Risk 2 — SSR/CSR data drift on filter change

The SSR schema reflects the URL's query params at request time. When a user clicks a category bubble client-side, `ShopClient` updates the URL via `router.replace()` — this is a **soft** navigation that does NOT trigger a server re-render. The page's SSR-rendered ItemList block stays anchored to the URL's original (or most-recently-server-rendered) query state.

**Impact:** for **users**, the SSR schema is invisible (it's metadata for bots). For **bots**, each crawled URL gets its own SSR render, so the schema always matches the URL. The drift exists but doesn't matter for SEO.

**Acceptance:** matches existing pattern for LocalBusiness + FAQ schema — they also don't update on soft navigation. Acceptable.

### Risk 3 — `limit=50` SSR vs CSR mismatch

Both SSR `getItems()` and CSR `fetchItems()` use `limit(50)`. Schema is capped at `.slice(0, 10)`. No mismatch today. Future-proofing concern: if someone changes the CSR limit without updating SSR, the SSR schema stays at the old limit. The new helper takes `items` as a parameter so it's correct by construction.

### Risk 4 — SEO impact of switching shape

The schema **shape stays identical** in the proposed implementation (same fields, same gates, same cap). The only change is WHEN it's serialized — initial HTML vs post-hydration. SEO impact is positive (Googlebot doesn't have to render JS) and risk-free since the payload doesn't change.

### Risk 5 — Behavior change on `/` (homepage)

Today the homepage emits ItemList CSR only when `?category=` is set. Lifting to SSR with the same gate preserves behavior. If Hamzah opts to broaden emission to the no-category case, that's a deliberate scope expansion called out in Section 7.

### Risk 6 — `replace(/</g, '\\u003c')` not currently applied to ItemList

The existing CSR emission does NOT escape `<` (line 201: `JSON.stringify(dynamicSchema)`). The proposed SSR emission DOES escape (matching LocalBusiness pattern). This is a security improvement, not a regression. The full `escapeJsonLd` helper used in `/item/[id]/page.tsx` (the Phase 6.4 PR A pattern) is stricter still — Section 7 raises whether to standardize.

### Rollback plan

Single revert: revert the PR. The CSR block is deleted in the same commit, so revert restores prior behavior atomically. No DB changes, no migration, no env vars touched.

### Build-time risk

`buildShopItemListSchema` is pure and small. No new dependencies. Type-checks cleanly given existing `ShopItem` interface and `resolvePublicItemFields` signature. Zero ripple into appliance tracker or admin code.

---

## Section 7 — Open Questions for Hamzah

1. **Emit ItemList on `/` (homepage) when a `?category=` is present?** Today the homepage CSR-emits with the same gate; SSR migration trivially preserves this. Confirm we want to keep `/?category=appliances` emitting an ItemList, or scope this PR to `/shop` only and leave `/` as-is for a follow-up.

2. **Emit ItemList on the no-category view (`/shop` and `/`)?** Currently nothing is emitted when no category is selected. Options:
   - **A.** Keep current behavior (no schema on the all-items view). Conservative; no SEO downside since the page is more navigational than catalog-listing.
   - **B.** Emit a `name: "Used Goods at Bu Faisal"` ItemList for the all-items view. Adds crawl signal but may overlap with Organization-level schema from PR #54.
   - Recommendation: stay with A in this PR; revisit if Google Search Console shows the all-items page underperforming.

3. **Switch to URL-only ListItem pattern?** Current implementation is the all-in-one pattern (full nested `Product` per element). Trade-off:
   - **Stay all-in-one:** richer per-element context, larger payload (~8 KB for 10 items), redundant data already on each `/item/[id]` page.
   - **Switch to URL-only:** smaller payload (~1 KB), defers to per-item Product schema, eliminates risk of stale `sale_price` snapshots in the list schema.
   - Google's docs don't explicitly favor either for Products. Recommendation: stay all-in-one for THIS PR (zero-behavior-change is the goal), file a follow-up issue to A/B the URL-only pattern if Search Console data warrants.

4. **Minimum item count threshold for emission?** Currently emits with `items.length > 0` (i.e. as few as 1 item). Google's carousel docs (Section 4) state the ItemList for carousel rich results needs ≥ 2 `ListItem` objects. Since we already established Product isn't carousel-eligible, this is moot, but if Hamzah wants belt-and-braces conformance, raise the threshold to `items.length >= 2`. Small change to the gate in `buildShopItemListSchema`.

5. **Standardize JSON-LD escaping helper across `/shop`, `/`, and `/item/[id]`?** `/item/[id]` uses the full `escapeJsonLd()` helper (Phase 6.4 PR A — rewrites `</script>` then escapes remaining `<`). `/shop` and `/` only do the partial `replace(/</g, '\\u003c')`. This PR is a natural moment to either (a) keep the existing simpler escape for the new ItemList block (matches sibling LocalBusiness/FAQ on the same page — consistent), or (b) hoist `escapeJsonLd` from `/item/[id]/page.tsx` to a shared module and standardize all five emission sites. Recommendation: do (a) in this PR, file (b) as housekeeping.
