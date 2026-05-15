# Phase 8 — Admin Override Audit (read-only)

**Date:** 2026-05-14
**Scope:** Find every gap between the admin-override columns Phase 1B created and what `/admin/pending` actually lets an admin edit, then trace whether those overrides reach the public site. Identify the cascading effects of adding `admin_condition_type` and `admin_shop_id` so the next PR doesn't introduce silent regressions.
**Status:** Audit only — no code modified.

---

## 1. Current UI state — `/admin/pending/[id]` detail editor

File: [`src/app/admin/pending/[id]/page.tsx`](src/app/admin/pending/[id]/page.tsx)

### 1.1 Fields the UI exposes today (admin can type into)

The page renders the following editable controls (all bound to `admin_*` columns via the `valueOf()` / `setField()` helpers):

| # | Label in UI | DB column written | Control |
|---|---|---|---|
| 1 | Brand | `admin_brand` | text input |
| 2 | Item Name | `admin_item_name` | text input |
| 3 | Category | `admin_category` | `<select>` (8 categories) |
| 4 | Product Type | `admin_product_type` | `<select>` (PRODUCT_TYPES) |
| 5 | SEO Title | `admin_seo_title` | text input (maxLength 120) |
| 6 | Meta Description | `admin_meta_description` | textarea (maxLength 300) |
| 7 | Body Description | `admin_description` | textarea |
| 8 | Slug | `admin_slug` | text input (font-mono) |
| 9 | Condition Grade (Used items only) | `admin_condition_grade` | `<select>` Excellent / Good / Fair |
| 10 | Spec Table | `admin_spec_table` | dynamic key/value rows |
| 11 | FAQs (4 entries) | `admin_faqs` | accordion question + answer pairs |
| 12 | Trust Signals | `admin_trust_signals` | checkbox list (12 whitelist + any AI off-whitelist) |

### 1.2 Read-only / informational sections

- Photo grid (4 photos, click to lightbox)
- "Barcode extracted by AI" line
- Worker + shop + submitted-at + worker price + worker condition + confidence row
- Worker note (if present)
- AI flags row
- Audit log section

### 1.3 What the spec says SHOULD be editable but is NOT exposed in the UI

Comparing against Phase 5B (`docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md` lines 660-687) and the Phase 1B admin column list (lines 143-162):

| DB column | In UI? | Notes |
|---|---|---|
| `admin_price_aed` | **NO** | Spec line 159 says admin can override worker price. Backend PATCH accepts it (`src/app/api/admin/pending/[id]/route.ts:102-106`), the `PendingItemEdits` type declares it, eligibility logic counts it as an override — but the UI has no input. **Primary gap.** |
| `admin_negotiable` | **NO** | Spec line 160. Same status as above: backend ready, no UI. **Primary gap.** |
| `admin_image_alt_texts` | **NO** | Spec line 155. Backend PATCH accepts it. UI has no editor. (Lower priority — image alt texts.) |
| `admin_geographic_anchor` | **NO** | Spec line 156. Backend ready. UI absent. (Lower priority — geographic_anchor is not rendered anywhere on the public site today, only stored.) |
| `admin_internal_link_targets` | **NO** | Spec line 157. Column is referenced in `buildPublishUpdate()`'s `overrideKeys` list but `published_internal_link_targets` does not exist — CLAUDE.md flags this as a dangling reference cleaned up in Phase 9. Practically dormant. |

### 1.4 Specific confirmations Hamzah asked about

- **Price input:** NO. There is no `<input type="number">` for `admin_price_aed` anywhere in `[id]/page.tsx`. The "Worker price: 800 AED" line in section §1.2 is display-only.
- **Negotiable toggle:** NO. Worker's flag appears in the WhatsApp pre-fill and on the public-site Negotiable / Starting-Price pill (via `admin_negotiable ?? worker_negotiable` at render time), but the admin editor has no toggle to flip it.
- **Condition Grade (Excellent/Good/Fair) toggle:** YES — but only when `worker_condition_type === 'Used'` (the `<select>` at line 697-719 of the page is wrapped in that gate). For New items the grade row is intentionally hidden.
- **Condition Type (Used/New) toggle:** NO. The column `admin_condition_type` does not exist in the database (confirmed by SQL in §2). The interface doesn't surface it. Worker's choice is final today.
- **Condition Notes:** NO. `condition_notes` is a legacy column on `shop_items`, written by `/team` at upload, displayed on the public site at line 323 of `item-detail-client.tsx`. There is no `admin_condition_notes` column and no UI editor.
- **Shop reassignment:** NO. `admin_shop_id` does not exist. The "Shop: BF4" line in the worker-info section is display-only. The shop is locked at worker insert via `worker_shop_id` and `shop_label`.

---

## 2. Current column state — SQL inventory

Live SQL queries against production Supabase (service role read, no writes).

### 2.1 `admin_*` columns that EXIST on `shop_items`

```
admin_approved_at
admin_approved_by
admin_brand
admin_category
admin_condition_grade
admin_description
admin_faqs
admin_geographic_anchor
admin_image_alt_texts
admin_internal_link_targets
admin_item_name
admin_meta_description
admin_negotiable
admin_price_aed
admin_product_type
admin_seo_title
admin_slug
admin_spec_table
admin_trust_signals
```

Total: 19 admin_* columns (17 editable + 2 audit). Matches the spec's Phase 1B list line-for-line.

### 2.2 `admin_*` columns that DO NOT exist (require migration)

Three columns Hamzah is considering adding return PostgREST errors when queried, confirming they are not in `shop_items`:

- `admin_condition_type` — would override `worker_condition_type` Used/New flip
- `admin_shop_id` — would override `worker_shop_id` for shop reassignment
- `admin_condition_notes` — would let admin edit / suppress worker's free-text note

### 2.3 Non-null counts per existing `admin_*` column

Out of **142 total rows** in `shop_items` (statuses: 15 published / 11 pending / 54 NULL / 62 archived):

| Column | Rows with non-null value |
|---|---|
| `admin_approved_at` | **16** |
| `admin_approved_by` | **16** |
| `admin_spec_table` | 7 |
| `admin_trust_signals` | 5 |
| `admin_brand` | 0 |
| `admin_item_name` | 0 |
| `admin_product_type` | 0 |
| `admin_category` | 0 |
| `admin_seo_title` | 0 |
| `admin_meta_description` | 0 |
| `admin_description` | 0 |
| `admin_slug` | 0 |
| `admin_faqs` | 0 |
| `admin_image_alt_texts` | 0 |
| `admin_geographic_anchor` | 0 |
| `admin_internal_link_targets` | 0 |
| `admin_condition_grade` | 0 |
| `admin_price_aed` | **0** |
| `admin_negotiable` | **0** |

The 16 approvals via the new dashboard never used `admin_price_aed` or `admin_negotiable` (as expected — no UI), but they also never used 14 of the 17 admin override columns that the UI does expose. The spec table and trust signals are the only fields admins have actually been editing in production so far.

### 2.4 Phase 6 published_product_schema coverage

Of the **69 currently published rows** (`is_published=true`), only **14** have a non-null `published_product_schema`. The remaining 55 emit no Product JSON-LD at all on `/item/[id]`. (The Phase 7 handoff said "3 of 49" — coverage has improved as 11 more Phase 5 approvals have landed since.) Not directly Phase 8 scope, but relevant context: any admin override audited here only affects rows that go through `/admin/pending` going forward.

---

## 3. Public site propagation

### 3.1 `resolvePublicItemFields()` — text-field resolver

File: [`src/lib/resolve-public-item-fields.ts`](src/lib/resolve-public-item-fields.ts)

The resolver covers **12 fields**. The fallback chain for each is `published_X ?? legacy_X` (NOT `admin_X ?? ai_X` or `admin_X ?? worker_X`). The admin override is already baked into the `published_*` snapshot at approve time, so this resolver does NOT need to know about admin columns directly:

| Resolver field | Source chain |
|---|---|
| `itemName` | `published_item_name ?? item_name` |
| `brand` | `published_brand ?? brand` |
| `category` | `published_category ?? category` |
| `productType` | `published_product_type ?? product_type` |
| `description` | `published_description ?? description` |
| `seoTitle` | `published_seo_title ?? seo_title` |
| `seoDescription` | `published_meta_description ?? seo_description` |
| `productSchema` | `published_product_schema ?? null` (no legacy column) |
| `faqSchema` | `published_faq_schema ?? null` |
| `specTable` | `published_spec_table ?? null` |
| `faqs` | `published_faqs ?? null` |
| `trustSignals` | `published_trust_signals ?? null` |

**Crucially: the resolver does NOT read `admin_price_aed`, `admin_negotiable`, `admin_condition_grade`, or `admin_shop_id`.** It also does not read `item.sale_price` or `item.negotiable` or `item.condition`. Those four are handled outside the resolver, directly at render time.

### 3.2 Price, negotiable, condition, shop — direct reads on `/item/[id]`

Searching the public render paths (`src/app/item/[id]/item-detail-client.tsx`, `src/lib/constants.ts`, `src/app/page.tsx`, `src/app/shop/`, `src/components/ItemCard.tsx`, `src/lib/augment-product-schema.ts`, `src/lib/similar-items.ts`, `src/app/api/feed/route.ts`):

#### Price

- **`item-detail-client.tsx:106,288`** — `{item.sale_price ? \`AED ${item.sale_price}\` : 'Ask Price'}` for the SimilarItemCard and the main detail page.
- **`marketplace-client.tsx:163,184`** — homepage uses `item.sale_price` directly.
- **`shop/page.tsx:143`** — ItemList JSON-LD `price: item.sale_price || 0`.
- **`components/ItemCard.tsx:112`** — same pattern.
- **`api/feed/route.ts:74,106`** — RSS / Google product feed reads `item.sale_price`.
- **`lib/constants.ts:97`** — `buildWhatsAppUrl()` line item reads `item.sale_price`.

**Total: 6 distinct call sites read `item.sale_price` directly. None of them consult `admin_price_aed` first.**

The Product JSON-LD `offers.price` comes from the stored `ai_product_schema` (frozen at AI generation time, sourced from `worker_price_aed`). `augmentProductSchema()` does NOT touch `offers.price`.

#### Negotiable

- **`item-detail-client.tsx:109,291`** — `(item.admin_negotiable ?? item.worker_negotiable) === false ? Starting Price : Negotiable`.
- **`lib/constants.ts:87`** — `buildWhatsAppUrl()` uses `item.admin_negotiable ?? item.worker_negotiable`.
- **`augment-product-schema.ts:21-23`** — caller in `page.tsx:105` passes `item.admin_negotiable ?? item.worker_negotiable` for the description hint.

The handoff says `admin_negotiable` overrides "don't propagate" — that's partially right: the **pill** and the **WhatsApp opener** and the **"Price is negotiable" hint** in the schema DO honor `admin_negotiable`. What doesn't: `ItemCard.tsx` and the listings on `/`, `/shop`, similar items grid each just render the price + a yellow "Negotiable" pill conditionally on `!!item.sale_price`, without re-checking negotiable. (See `marketplace-client.tsx:184` — no negotiable pill at all on the homepage list; ItemCard renders the pill only when sale_price present, no negotiable check.) Worth re-reading for the next session — the gap is narrower than the handoff implied.

#### Condition grade

- **`item-detail-client.tsx:138`** — `const conditionGrade = item.admin_condition_grade ?? item.worker_condition_grade;` (rendered in `<ConditionBadge>` and the legacy 2×2 grid fallback).
- **`api/feed/route.ts:73,107`** — `mapCondition(item.worker_condition_type, conditionGrade)` where `conditionGrade = item.admin_condition_grade ?? item.worker_condition_grade`.

Both consumers honor the admin override. **Condition grade propagation is correct today.**

#### Condition TYPE (Used/New)

- **`item-detail-client.tsx`** — does NOT render Used/New explicitly. The grade badge surfaces "Excellent / Good / Fair" only.
- **`api/feed/route.ts:73,107`** — `mapCondition(item.worker_condition_type, ...)` reads `worker_condition_type` directly. This is the ONLY public-side consumer of condition_type.
- The Product JSON-LD `itemCondition` (UsedCondition vs NewCondition) is frozen into `ai_product_schema` at generation time. `augmentProductSchema()` does not touch it.

Total: **`mapCondition()` is the only render-time consumer** of condition_type, but the JSON-LD `itemCondition` is baked at AI time and would not change retroactively.

#### Shop

- **`item-detail-client.tsx:136`** — `const shop = getShop(item.worker_shop_id);` (used for spec-table "Location" link + fallback grid display).
- **`lib/constants.ts:86`** — `buildWhatsAppUrl()` reads `getShop(item.worker_shop_id)` for the `📍 Shop X, Ajman` line in the WhatsApp draft.
- **`lib/similar-items.ts:39,69`** — Tier 2 query filters on `worker_shop_id`.

The Product JSON-LD `seller` block from `augmentProductSchema()` is per-Org (`Bufaisal` / `Bu Faisal General Trading LLC`) — does NOT include per-shop info. The 5-shop LocalBusiness block in `local-business-schema.ts` is route-level and unrelated to per-item shop identity.

**Total: 3 distinct render-time consumers read `worker_shop_id` directly. None of them currently consult an `admin_shop_id` fallback (the column does not exist).**

### 3.3 Summary table

| Concept | Public-site read site | Honors admin override today? |
|---|---|---|
| Price (`sale_price`) | 6 sites (detail, ItemCard, marketplace, shop, feed, WhatsApp) | **No** — all read `item.sale_price` directly |
| Negotiable pill / hint | 3 sites (item detail x2, WhatsApp, schema augmenter) | **Yes** — `admin_negotiable ?? worker_negotiable` everywhere |
| Negotiable pill on grid cards (ItemCard / marketplace) | 2 sites | **N/A** — those grid cards don't render the negotiable signal at all today |
| Condition grade | 2 sites (item detail, feed) | **Yes** — `admin_condition_grade ?? worker_condition_grade` |
| Condition type (Used/New) | 1 site (feed) + frozen in `ai_product_schema` | **No** — no `admin_condition_type` column exists |
| Shop (`worker_shop_id`) | 3 sites (item detail spec-table, WhatsApp, similar-items) | **No** — no `admin_shop_id` column exists |
| Condition notes | 1 site (item detail amber box) | **No** — no `admin_condition_notes` column exists |

---

## 4. Approval flow — `published_*` writes

File: [`src/lib/admin-pending-publish.ts`](src/lib/admin-pending-publish.ts) (function `buildPublishUpdate`)

### 4.1 Columns the approval endpoint writes to

Sixteen `published_*` columns + status + audit metadata. Source rules:

| Column | Source |
|---|---|
| `published_brand` | `admin_brand ?? ai_brand` |
| `published_item_name` | `admin_item_name ?? ai_item_name` |
| `published_product_type` | `admin_product_type ?? ai_product_type` |
| `published_category` | `admin_category ?? ai_category` |
| `published_seo_title` | `admin_seo_title ?? ai_seo_title` |
| `published_meta_description` | `admin_meta_description ?? ai_meta_description` |
| `published_description` | `admin_description ?? ai_description` |
| `published_spec_table` | `admin_spec_table ?? ai_spec_table` |
| `published_faqs` | `admin_faqs ?? ai_faqs` |
| `published_trust_signals` | `admin_trust_signals ?? ai_trust_signals` |
| `published_slug` | `admin_slug ?? ai_slug` |
| `published_h1_title` | mirrors `pSeoTitle` (h1 always = SEO title per locked spec) |
| `published_geographic_anchor` | `admin_geographic_anchor ?? ai_geographic_anchor` |
| `published_image_alt_texts` | `admin_image_alt_texts ?? ai_image_alt_texts` |
| `published_product_schema` | `substituteSchemaImages(ai_product_schema, item)` — no admin override layer |
| `published_faq_schema` | `ai_faq_schema` — no admin override layer |
| `published_at` | `now()` |
| `status` | `'published'` |
| `is_published` | `true` |
| `admin_approved_at`, `admin_approved_by`, `approved_at`, `approved_by` | audit fields |

### 4.2 What is NOT written by the approval endpoint

- **`published_price_aed` does not exist as a column.** Nor does `published_negotiable`, `published_condition_grade`, `published_condition_type`, `published_shop_id`. The legacy mirror in `admin-pending-publish.ts` previously wrote `sale_price` and `negotiable` to keep the public site working, but **that mirror block was deleted in Phase 6.6 (PR #50)** along with the rest of the legacy mirrors. After 6.6 the approval endpoint touches NONE of the four columns that drive price / negotiable / condition / shop on the public site.

This is the structural reason the handoff calls `admin_price_aed` "dormant" — it has nowhere to go after approve. The override is captured, written to `admin_price_aed`, but no downstream column reads it, no `published_*` column carries it, and the public site keeps showing the worker price.

### 4.3 What honors admin override today (without published_* round-tripping)

Three columns dodge the missing-`published_*`-column problem because the resolver / consumer reads `admin_X ?? worker_X` (or `admin_X ?? ai_X`) directly at render time:

- `admin_negotiable` — read by `item-detail-client.tsx` + `buildWhatsAppUrl` + `augmentProductSchema`.
- `admin_condition_grade` — read by `item-detail-client.tsx` + `mapCondition()`.

`admin_price_aed` is *almost* in the same shape — the PATCH accepts it, the eligibility check counts it, but nobody reads it at render time. Adding `item.admin_price_aed ?? item.sale_price` (or migrating to `item.admin_price_aed ?? item.worker_price_aed`) at the 6 sites in §3.2 would close the gap without a schema change.

---

## 5. The `condition_type` question — adding `admin_condition_type`

### 5.1 Migration needed

```sql
ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS admin_condition_type text;
-- Optional CHECK ('Used','New') or rely on app-level validation.
```

### 5.2 Where condition_type currently flows

1. **Worker insert** (`/team`): worker selects Used/New → written to `worker_condition_type` + lowercased into legacy `listing_type`.
2. **AI prompt input** (`generate-listing/route.ts:528`): `conditionType: item.worker_condition_type ?? 'Used'` is passed to Sonnet as `condition_type:` in the user message.
3. **AI output is heavily shaped by condition_type**:
   - SEO title prefix: "Used X" vs "Brand New X"
   - Trust signals: Used Appliances get "7-day warranty included" + "Anything wrong, we fix it" + "Tested by our team before listing"; New custom-made furniture gets "Made by Bufaisal — any issue, our call center resolves it"; furniture in either type gets "Trucks include carpenters for free assembly"
   - Description language: "Tested by our team" only for used items
   - FAQ #1 (Quality) wording: differs between Used and New
   - FAQ #3 (Negotiation) wording: "starting price for this made-to-order item" for New, plain "starting price" for Used
   - Brand handling: New custom-made items have brand = empty/null
   - `itemCondition` in Product JSON-LD: `UsedCondition` vs `NewCondition`
4. **Render-time consumers** (today):
   - `api/feed/route.ts:73,107` — `mapCondition(item.worker_condition_type, ...)` for Google product feed.
5. **Frozen in stored schema**:
   - `ai_product_schema.itemCondition` (and via `published_product_schema`)

### 5.3 Cascading effects if admin flips Used ↔ New post-AI

If admin just toggles `admin_condition_type` without regenerating:

| Field | Effect |
|---|---|
| Feed XML `<g:condition>` | Flips correctly (single render-time read updated to `admin?? worker`) |
| Page `<ConditionBadge>` | Unchanged today (badge displays grade, not type) |
| AI-generated SEO title | Stale — still says "Used X" even if flipped to New |
| AI-generated description | Stale — still says "Tested by our team before listing" |
| AI-generated FAQs | Stale — Q1/Q3 wording wrong for new type |
| AI-generated trust signals | Stale — wrong warranty/carpenter copy |
| `published_product_schema.itemCondition` | Stale — frozen at generation |
| `published_product_schema.brand` (if New) | Stale — AI omitted brand for New items |

**Recommendation:** treat admin flipping condition_type as a *regenerate-required* operation. The clean UX is: when admin selects a different `admin_condition_type`, prompt "This changes the listing language. Regenerate AI listing?" If yes → status returns to 'processing', AI re-runs with new condition_type. If no → save the flip but warn that body copy may not match. Don't try to partially patch downstream fields — too many subtleties (Brand rules for New, FAQ wording, trust signal eligibility, title prefix). Single source of truth: regenerate.

The PATCH validator at `[id]/route.ts:78-143` would need a new case for `admin_condition_type` accepting `'Used' | 'New' | null`.

---

## 6. The shop-reassignment question — adding `admin_shop_id`

### 6.1 Migration needed

```sql
ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS admin_shop_id text;
-- Optional CHECK (admin_shop_id IN ('BF1','BF2','BF3','BF4','BF5'))
```

### 6.2 Where shop_id currently flows

1. **Worker insert**: `worker_shop_id` (BF1–BF5) + legacy `shop_label` (A–E) + legacy `shop_source` ("Shop A") all written from the worker session token.
2. **AI prompt input**: shop_id, shop_name ("Shop X"), shop_location ("Ajman") passed to Sonnet.
3. **AI uses shop in**:
   - `geographic_anchor`: "Available at Shop X, Ajman. Delivery to all 7 emirates within 24-48 hours."
   - Description body: "Available at Shop X, Ajman..."
   - `internal_link_targets.same_shop`: stores the shop id for "more from this shop" navigation
   - Spec table `Location` row: "Shop X, Ajman"
4. **Render-time consumers** (today):
   - `item-detail-client.tsx:136` — `getShop(item.worker_shop_id)` for spec-table Location link + 2×2 grid fallback display
   - `lib/constants.ts:86` — `buildWhatsAppUrl()` `📍 ${shop?.displayName}` line
   - `lib/similar-items.ts:39,69` — Tier 2 query `eq('worker_shop_id', shopId)`

### 6.3 Cascading effects if admin reassigns shop

The product `/item/[id]` route uses UUID, not slug — **URL identity is not affected** by shop change. Good.

But the stored AI output bakes the old shop into:

| Field | Effect |
|---|---|
| Spec-table Location link (read fresh via `getShop()`) | Flips correctly if read switches to `admin_shop_id ?? worker_shop_id` |
| WhatsApp `📍 Shop X, Ajman` line | Flips correctly (same fix) |
| Similar items Tier 2 query | Flips correctly (same fix) |
| `published_description` body text "Available at Shop X" | Stale — frozen in AI output |
| `published_geographic_anchor` | Stale — same |
| `published_spec_table.Location` cell value | Stale — frozen at generation |

**Recommendation:** Same flavor of decision as condition_type but lower stakes. Three options:
1. **Hide-and-update only** (cheap): change the three render-time consumers to read `admin_shop_id ?? worker_shop_id` and accept that body description / geographic_anchor / spec-table cell stay stale. The Location link / WhatsApp / similar-items reflect the new shop. Probably good enough — admins reassign shops mostly to fix typos and the body description text is "Available at Shop X, Ajman" surrounded by other content; nobody re-reads it.
2. **Targeted server-side patch**: at save time, run a string-replace on `published_description` / `published_geographic_anchor` / `published_spec_table['Location']` swapping the old shop_name for the new one. Fragile (AI's natural-language phrasing varies).
3. **Force regenerate**: same logic as condition_type — flip = regenerate. Heaviest hammer, simplest contract.

Lean toward option 1 for shop_id (it's a minor identity tweak). Save regenerate for condition_type where the cascade is deeper.

---

## 7. Risks

- **URL identity**: `/item/{id}` uses the UUID, not slug, not shop, not category. Changing `admin_slug` / `admin_category` / `admin_shop_id` does NOT break existing URLs. Confirmed — `slug` is never read on `/item/[id]` rendering (only stored).
- **WhatsApp prefill freshness**: today `buildWhatsAppUrl()` reads `item.sale_price`, `getShop(item.worker_shop_id)`, `f.itemName` (via resolver). If admin overrides price or shop without backfilling sale_price / shop, the WhatsApp draft sent to the customer says the OLD price / OLD shop — visible-to-customer bug. Affects price and shop overrides.
- **Stale AI-baked body copy**: `published_description`, `published_geographic_anchor`, `published_spec_table['Location']`, `published_image_alt_texts`, and the `published_product_schema` (itemCondition, brand for New, description) all freeze at AI time. Any post-AI override of condition_type or shop_id leaves these stale. Manageable for shop_id (low impact phrasing). Material for condition_type (warranty language, trust signals, title prefix).
- **Feed XML divergence**: `api/feed/route.ts` reads worker_condition_type directly. If `admin_condition_type` is added, the feed must learn the new fallback or Google Shopping will see one condition while the public page shows another.
- **ItemCard / marketplace listings** today render no "Negotiable" pill on the homepage grid (`marketplace-client.tsx:163-184` shows price only). So negotiable override propagation gaps are mostly invisible on the homepage — only the detail page + WhatsApp see it. Hamzah may want this to ALSO surface on grid cards, in which case more sites need the `admin?? worker` pattern.
- **Quick Approve eligibility**: `isQuickApproveEligible()` returns false the moment any admin_* column is non-null. If admin sets `admin_price_aed` even by 1 AED, the row drops out of quick-approve. Expected behavior, just worth flagging.
- **Audit log richness**: the approval endpoint records `overrides_applied` (list of override column names). When admin override scope grows, the metadata grows with it for free — no schema change needed.
- **Phase 6 `published_*` snapshot contract**: today every `published_*` column is filled from `admin?? ai` (or in two cases just `ai`). Adding `admin_price_aed` / `admin_negotiable` / `admin_condition_type` / `admin_shop_id` without corresponding `published_*` columns means the contract becomes: "some admin overrides are reflected via `published_*` snapshot, others are read at render time via `admin?? worker` fallback." That's a meaningful architectural fork worth a sentence in the spec. Either accept the split, or also add `published_*` mirrors (e.g. `published_price_aed`, `published_negotiable`, `published_condition_type`, `published_shop_id`) and read those at render time.

---

## 8. Recommended PR split

Three reasonable batches. Picking among them is a scope call, but the audit suggests:

### PR A — Wire price + negotiable inputs into the editor (NO schema migration)

- Add `<input type="number">` for `admin_price_aed` (with `min=1`, step=1) plus a Reset link.
- Add a "Negotiable" `<select>` or toggle for `admin_negotiable` (true / false / clear).
- Update `[id]/page.tsx` to plumb these through the existing `valueOf` / `setField` / `hasOverride` helpers.
- Touch the public-side price reads to honor `admin_price_aed ?? sale_price` (6 sites). Decide once: stick with `item.sale_price` everywhere (and write the admin override back to `sale_price` at approve) OR add a helper `getEffectivePrice(item)` and migrate all 6 sites.
- Negotiable already works at the detail / WhatsApp / schema-augmenter sites — verify and decide whether to extend to grid cards (`ItemCard.tsx`, `marketplace-client.tsx`) or leave as-is.

Smallest, highest-immediate-value change. No DB migration. Closes the audit's #1 surprise (a column-and-API-and-type pipeline exists but the UI is missing).

### PR B — Add `admin_condition_type` with regenerate-on-flip flow

- Schema migration adding `admin_condition_type text`.
- UI: a `<select>` Used / New / "use worker value" gated on `worker_condition_type` non-null.
- Backend PATCH accepts the new field.
- Decision flow when admin flips: show modal "This changes the listing language. Regenerate AI listing? (Recommended)" with options Regenerate / Save flip only. If Regenerate, route to `/api/admin/pending/[id]/regenerate` after saving; if not, save with a warning toast.
- Feed XML reads `admin_condition_type ?? worker_condition_type`.
- `mapCondition()` signature might need to change.

Higher risk than PR A. Has cascading copy implications (warranty language, trust signals, title prefix, FAQ wording, brand-omission rule). Regenerate-on-flip keeps the contract clean.

### PR C — Add `admin_shop_id` + condition_notes (minor)

- Schema migration adding `admin_shop_id text` and `admin_condition_notes text`.
- UI: `<select>` for shop reassignment (BF1–BF5 + clear); textarea for admin_condition_notes.
- Public-side: change `item-detail-client.tsx`, `buildWhatsAppUrl()`, `fetchSimilarItems()` from `worker_shop_id` to `admin_shop_id ?? worker_shop_id`. Change condition_notes display to `admin_condition_notes ?? condition_notes`.
- Accept stale body copy in `published_description` and `published_geographic_anchor` — admin notes that.

Lowest stakes, but most files touched (shop_id has 3 render-time consumers, condition_notes has 1). Could ship with PR A if the schema migration is small enough to bundle.

### Considerations

- **PR A first.** Highest payoff per LOC, no migration, closes the visible gap.
- **PR B as its own batch.** The regenerate-on-flip flow is a real architectural addition.
- **PR C optional.** Could be combined with PR B if Hamzah wants one schema migration covering both new columns. Or skipped entirely for now — neither shop reassignment nor condition_notes is a customer-visible incident waiting to happen.
- **Open architecture question for PR A:** do we add `published_price_aed` / `published_negotiable` columns and a Phase 6.5-style cutover, or do we keep the `admin?? worker` fallback pattern at render time and accept that this gives us two override-propagation patterns (`published_*` snapshot for most fields, `admin?? worker` for these four)? The Phase 6.6 mirror deletion explicitly chose to use `published_*` exclusively for the resolver fields. Repeating that pattern for price/negotiable would mean adding 4 new columns + 4 new resolver chains. The lighter alternative (read `admin?? worker` at render time) breaks the "published_* is the single snapshot" rule but is far simpler. Worth a one-line decision lock before PR A starts.
