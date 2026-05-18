# Listing Generator Rebuild — Phase State

**Last updated:** 2026-05-17
**Owner:** Hamzah Khan
**Driver doc:** `docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md`
**Decisions log:** `docs/Bufaisal-Decisions-Log-v1_1-Addendum.docx`

This file is the canonical phase ledger for the listing-generator rebuild. Update it at the close of every phase. Future Claude sessions read this first.

---

## Where we are right now

**As of 2026-05-17, main is on Phase 8 (admin-override series). Last shipped PR: [#57](https://github.com/nonstophamzah/bufaisal-website/pull/57) (Phase 8 PR 1 — admin price + negotiable + condition_grade override inputs, merged 2026-05-15). Next planned: a two-week passive observation period agreed in the PR #57 / [#58](https://github.com/nonstophamzah/bufaisal-website/pull/58) handoff — confirm admins actually use the new overrides in production before shipping PR B (`admin_condition_type` with regenerate-on-flip flow) or PR C (`admin_shop_id` + `admin_condition_notes`) from [`docs/phase-8-admin-override-audit.md`](phase-8-admin-override-audit.md).** Open work: PR [#58](https://github.com/nonstophamzah/bufaisal-website/pull/58) (docs-only handoff addendum for PR #57). Phase 9 (legacy cleanup) has not started.

---

## Phase ledger

### Phase 0 — Audit & discovery
**Status:** ✅ Complete

Findings reported. State-machine mismatch flagged (legacy `agent_drafting`/`pending_review` vs spec's `processing`/`pending`). Established the rebuild scope.

### Phase 1 — Database schema migration
**Status:** ✅ Complete

**Commits:** `668e5b7` on main.
**Migration file:** `supabase-phase1-listing-generator.sql` in repo root.

What shipped:
- 67 nullable schema-separation columns on `shop_items` (`worker_*`, `ai_*`, `admin_*`, `published_*`).
- New `audit_log` table with RLS-enabled-no-policies (anon blocked, service_role bypasses).
- Status value migration: `pending_review` → `pending` (46 rows).
- Writer flipped from `'pending_review'` to `'pending'` at `src/app/api/jobs/generate-listing/route.ts`.

### Phase 2 — Photo upload optimization
**Status:** ✅ Complete

**Commits:** `7d5bfaf` (PR [#19](https://github.com/nonstophamzah/bufaisal-website/pull/19)), `1e639d8` (PR [#20](https://github.com/nonstophamzah/bufaisal-website/pull/20)).

What shipped:
- `browser-image-compression` library + self-hosted at `public/browser-image-compression.js`.
- CSP `worker-src 'self' blob:` so the Web Worker spawns on iPhone.
- Compression target: ~400KB max, 1600px long edge, JPEG.
- Phone-confirmed: 1–2s per photo on UAE 4G.

### Phase 3 — Worker upload screen rebuild
**Status:** ✅ Complete

**Commit:** `bd4cf90` on main (PR [#22](https://github.com/nonstophamzah/bufaisal-website/pull/22)).

What shipped:
- `src/app/team/page.tsx` rebuilt around the locked pill design: 4 photos (3 item + 1 visually-distinct barcode), Used/New, Excellent/Good/Fair (when Used), Negotiable Yes/No, price, optional note.
- AI Scan removed from worker side. Phase 4 runs the AI in the background.
- Draft autosave to `localStorage` (`bufaisal-upload-draft`, 12h TTL, scoped to worker name) with Resume/Discard prompt.
- Submit UX: 1.5s smooth progress bar → green tick "Item uploaded ✓" → auto-redirect.
- `/api/team/items` tightened to the new `worker_*` shape with full validation. Status default flipped `'agent_drafting'` → `'processing'`.
- TS union extended: `ShopItem.status` now includes `'processing'`.

### Phase 4 — Background AI processor
**Status:** ✅ Complete and verified end-to-end in production

**Commits:** `12a1a54` (PR [#23](https://github.com/nonstophamzah/bufaisal-website/pull/23)), `e7d4422` (PR [#24](https://github.com/nonstophamzah/bufaisal-website/pull/24)).

What shipped (summary — see prior versions of this ledger for full detail):
- `POST /api/items/[id]/generate-listing` — Bearer-auth'd, loads the locked SEO Agent v1.0 prompt, calls `claude-sonnet-4-6`, validates JSON (3 attempts), maps to 24 `ai_*` columns, flips `processing → pending`. Every failure mode produces a flagged `'pending'` row.
- `GET /api/cron/cleanup-stuck-processing` — daily cron at 4am UTC plus piggyback `waitUntil()` on every worker submit, via `src/lib/cleanup-stuck.ts::rescueStuckItems()`.
- `next.config.mjs` `outputFileTracingIncludes` bundles `lib/prompts/listing-generator-v1.md` with the serverless function.
- `src/lib/ai.ts` exports `CLAUDE_MODEL` (Haiku, legacy `/api/gemini`) + `CLAUDE_SONNET_MODEL` (Sonnet 4.6).

**Bug found and fixed in PR #24:** legacy admin-approve was clobbering `status` to `NULL` because it predated the Phase 1 state machine. Fix: legacy approve writes `status: 'published'`. **Audit_log gap noted, not fixed:** legacy admin-approve does NOT write to `audit_log` — Phase 5 closed this for the new sidecar dashboard.

**Verification record:** Production row `01ff3138-63a7-4267-b782-0a41c0330022` — `worker_submitted_at` → AI completion in 35s; admin approve set `status='published'`, `is_published=true`, `approved_by='Humaan'`. Full pipeline `processing → pending → published` verified.

### Phase 5 — Admin pending dashboard
**Status:** ✅ Complete AND verified end-to-end in production

**Primary commit:** `7f14be2` on main (PR [#26](https://github.com/nonstophamzah/bufaisal-website/pull/26)). Six follow-up PRs hardened the flow: [#27](https://github.com/nonstophamzah/bufaisal-website/pull/27) (image render fix), [#28](https://github.com/nonstophamzah/bufaisal-website/pull/28) (legacy Pending tab removed), [#29](https://github.com/nonstophamzah/bufaisal-website/pull/29) (detail status guard + visibility refresh + cleanup SQL), [#30](https://github.com/nonstophamzah/bufaisal-website/pull/30)/[#31](https://github.com/nonstophamzah/bufaisal-website/pull/31)/[#32](https://github.com/nonstophamzah/bufaisal-website/pull/32) (diagnostic infrastructure — all reverted), [#33](https://github.com/nonstophamzah/bufaisal-website/pull/33) (Cache-Control no-store middleware — incomplete), [#34](https://github.com/nonstophamzah/bufaisal-website/pull/34) (six-layer cache-defeat fix that actually worked).

**Verification record (2026-05-10):** Hitachi Top-Mount Refrigerator (`4cea5546-1da6-48cb-b6c2-bf7a61232278`) approved through `/admin/pending` at 18:12:33 UTC. SQL confirmed all `published_*` columns populated correctly: `published_seo_title`, `published_description` (296 chars), `published_spec_table`, `published_faqs`, `published_trust_signals`, `published_brand`, `published_category`, `admin_approved_at`, `admin_approved_by="Admin"`. Audit_log entry written with `action='admin_approved'`, `via='detail_editor'` or `'quick_approve'`.

**What shipped — sidecar architecture, no collision with legacy `/admin` or `/api/admin/items`:**
- `/admin/pending` — mobile-first card grid of `status='pending'` rows. Filters: All / Needs Review (any flag OR confidence < 0.8) / Quick Approve eligible / by shop / by category. Per-card: thumbnail, AI title, confidence dot, flag chips, Quick Approve + Review buttons.
- `/admin/pending/[id]` — full-page detail editor. 4-photo lightbox, 17 editable fields (text + spec table + FAQs + trust signals), AI-suggested reset pills, sticky bottom action bar (Approve / Save / Regenerate / Reject).
- `/api/admin/pending/*` — six endpoints (GET list, GET/PATCH detail, POST approve / quick-approve / reject / regenerate). Quick-approve gated by `confidence ≥ 0.8 AND empty ai_flags AND no admin overrides` — server re-checks the rule and returns 422 if violated.
- Shared helpers: `src/lib/admin-pending-api.ts`, `src/lib/admin-pending-publish.ts` (with `buildPublishUpdate()` + `writeAdminAudit()`), `src/app/admin/pending/lib/eligibility.ts`.
- Auth: reuses `useAdminAuth` + `verifyAdmin` (HMAC bearer from sessionStorage).
- Legacy `/admin` nav got one new "→ New Pending [BETA]" link — the only edit on the legacy admin code.

**Follow-up: legacy Pending tab removed (PR #28).** Two production rows had been approved through the legacy `/admin` Pending tab with all 12 `published_*` columns NULL — the legacy approve at `/api/admin/items` never computed them. Public site fell back to legacy text columns and looked correct, masking the bug. Fix: removed `'pending'` from the legacy `tabs` nav array, changed default state to `'published'`, dropped the `tab === 'pending'` render branch. The `'pending'` value stays in the `Tab` union for backwards compat with any direct API callers until Phase 9. `supabase-backfill-published-columns.sql` written to repair the 2 broken rows.

### Sitewide image-optimizer hotfix (PR [#27](https://github.com/nonstophamzah/bufaisal-website/pull/27))
**Status:** ✅ Complete and verified live in production
**Commit:** `d88da5a` on main.

**What broke:** Hours after Phase 5 shipped, every Cloudinary thumbnail rendered as a broken-image icon. `curl` confirmed `/_next/image?url=<cloudinary>...` returned `HTTP 402` with `x-vercel-error: OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — the project hit Vercel Hobby's monthly image-optimization quota.

**What shipped:**
- `src/lib/cloudinary-loader.ts` — custom next/image loader. Rewrites `res.cloudinary.com` URLs with Cloudinary's transforms (`f_auto,q_<n>,w_<n>,c_limit`); other URLs pass through.
- `next.config.mjs` `images.loader = 'custom'` so `/_next/image` is no longer in the path. Vercel quota no longer load-bearing.
- `src/lib/item-image.ts` — centralized fallback chain `thumbnail_url > image_urls[0] > worker_photo_brand_url > /og-image.png`.
- `src/lib/supabase.ts` — `worker_photo_*` columns added to `ShopItem`.

---

### Phase 6 — Public site rendering switch

Subdivided into sequential sub-phases. **All sub-phases (6.0 → 6.6) are now ✅ complete.** Public site reads `published_*` / canonical sources end-to-end; legacy mirror writes deleted.

#### Phase 6.0 — Visibility hygiene
**Status:** ✅ Complete (rolled into earlier PRs). Public `/item/[id]` filters on `is_published=true AND is_hidden=false`. `is_sold` intentionally NOT filtered so sold rows keep their SEO surface with the SOLD overlay.

#### Phase 6.1 — JSONB column additions
**Status:** ✅ Complete. Migration `021_add-phase6-published-columns.sql` added `published_h1_title`, `published_geographic_anchor`, `published_image_alt_texts`, `published_product_schema`, `published_faq_schema`, `published_slug`.

#### Phase 6.2 — Publish helper writes the new JSONB columns
**Status:** ✅ Complete (PR [#38](https://github.com/nonstophamzah/bufaisal-website/pull/38)). `buildPublishUpdate()` now writes all 16 `published_*` columns including JSONB schema fields.

#### Phase 6.3 — Public site reads text fields from `published_*`
**Status:** ✅ Complete (PR [#40](https://github.com/nonstophamzah/bufaisal-website/pull/40), commit `67cbd29`).

What shipped:
- `src/lib/resolve-public-item-fields.ts` resolver introduced. Pattern: `item.published_X ?? item.legacy_X` (`??`, never `||`).
- Consumers cut over for 7 text fields: `/item/[id]/page.tsx` (metadata + body), `/item/[id]/item-detail-client.tsx`, `/shop/shop-client.tsx`, `components/ItemCard.tsx`.
- Column-name mismatch documented: `published_meta_description` ↔ `seo_description` (Decisions Log v1.1).

#### Phase 6.4 PR A — `/item/[id]` schema + data wiring
**Status:** ✅ Shipped 2026-05-11 (PR [#44](https://github.com/nonstophamzah/bufaisal-website/pull/44), commit `495e0b7`).

What shipped:
- Resolver extended with five JSONB fields: `productSchema`, `faqSchema`, `specTable`, `faqs`, `trustSignals`.
- New `src/lib/augment-product-schema.ts` — render-time SEO augmentation. Non-destructive — fills `sku`, canonical URL, category, seller block with `legalName: "Bu Faisal General Trading LLC"`, idempotent "Price is negotiable." description hint.
- `src/app/item/[id]/page.tsx` — ripped out hand-built inline Product JSON-LD. Two `<script type="application/ld+json">` blocks: augmented `published_product_schema` + verbatim `published_faq_schema`. New `escapeJsonLd()` helper rewrites `</script>` to `<\/script>`.
- `src/app/item/[id]/item-detail-client.tsx` — semantic `<table>` spec table, native `<details>` FAQ accordion, bullet trust signals.
- `ShopItem` interface additions (all additive): `worker_negotiable`, `admin_negotiable`, `published_product_schema`, `published_faq_schema`, `published_spec_table`, `published_faqs`, `published_trust_signals`.
- Negotiable source: `item.admin_negotiable ?? item.worker_negotiable` (locked).

#### Phase 6.4 PR B — `/item/[id]` layout & conversion polish
**Status:** ✅ Shipped 2026-05-11 (PR [#45](https://github.com/nonstophamzah/bufaisal-website/pull/45), commit `3e24686`).

What shipped:
- New `src/lib/shops.ts` — canonical shop config. Maps BF1–BF5 to display names + Google Maps GBP URLs. `getShop(workerShopId)` lookup.
- Spec-table Location row renders as clickable Google Maps GBP link when shop has a `mapUrl`.
- New Photos section between spec table and FAQ — 4-thumbnail grid sourcing `worker_photo_*` columns directly. Click opens `yet-another-react-lightbox` (~30 KB, first image-display library in the repo).
- New `src/lib/similar-items.ts` — three-tier query (brand+category → category+shop → category), freshness sort, dedupe across tiers, hide if <4 matches.
- `SimilarItemCard` co-located in `item-detail-client.tsx` — purely navigational cards (no per-card WhatsApp button) to prevent cognitive split with main page CTA. Site-wide `ItemCard` unchanged for homepage / shop feeds.
- "WHATSAPP" → "NEGOTIATE" rename on desktop inline + mobile sticky buttons per Architecture doc 2.1.
- `ShopItem` interface: added `worker_shop_id`, `published_image_alt_texts`. Additive.

Patterns documented in PR [#46](https://github.com/nonstophamzah/bufaisal-website/pull/46) (docs-only).

#### Phase 6.5b.1 — Canonicalize public display reads through resolver
**Status:** ✅ Shipped 2026-05-12 (PR [#47](https://github.com/nonstophamzah/bufaisal-website/pull/47), commit `c8aa2c3`).

Row-based display surfaces cut over to canonical sources. Imports of `getShop()` from `src/lib/shops.ts` added to `buildWhatsAppUrl()` so the WhatsApp draft says the canonical shop name. Worker-condition resolver chain (`admin_condition_grade ?? worker_condition_grade`, `worker_condition_type`) introduced on every consumer.

#### Phase 6.5b.2 — Cut SSR query filters to `published_*`
**Status:** ✅ Shipped 2026-05-12 (PR [#49](https://github.com/nonstophamzah/bufaisal-website/pull/49), commit `493f46d`).

Server-side query filters on `/`, `/shop`, `/categories`, `/api/feed` switched from `category`/`brand` legacy columns to `published_category`/`published_brand`. With 6.5b.1 + 6.5b.2 every public surface (display + filter) is on canonical sources.

#### Phase 6.6 — Delete legacy mirror writes + fix JSON-LD sku
**Status:** ✅ Shipped 2026-05-12 (PR [#50](https://github.com/nonstophamzah/bufaisal-website/pull/50), commit `3357e3d`).

The "Phase 6 bridge — remove when public site reads published_* directly" block in `src/lib/admin-pending-publish.ts` was deleted. Admin approvals now write `published_*` columns exclusively; legacy text columns on `shop_items` stop receiving NEW writes from the approve flow (worker insert still writes them at submit time, by design).

Legacy text columns are kept in the table for backward compat with pre-Phase-5 rows. Column drops are deferred to Phase 9 or later.

**Hamzah Option A acceptance (2026-05-12) — knowingly accepted operational regressions:**
- **Legacy `/admin` Live/Sold/Hidden tabs** render items approved after 6.6 with blank product titles, empty categories, and no condition badges (AdminItems.tsx reads `item.item_name`, `item.category`, `item.condition` directly). Locked workflow is `/admin/pending`; items remain identifiable by photo + price + shop badge. Migration of legacy `/admin` to canonical sources deferred to Phase 9 or a dedicated cleanup PR.
- **Legacy `/admin` Edit form** writes to legacy columns only — those edits no longer surface on the public site. Admins should use `/admin/pending` re-approval.
- **`admin_price_aed` / `admin_negotiable` overrides** stop at the `admin_*` column after the mirror deletion (no `published_*` counterpart). Phase 8 PR 1 closed this by adding render-time fallback chains at every public consumer.

---

### Phase 7 — SEO / AEO / GEO schema upgrades
**Status:** ✅ Complete (4 PRs merged 2026-05-13). Full context in [`docs/phase-7-handoff.md`](phase-7-handoff.md); per-PR audits at [`docs/phase-7-pr53-audit.md`](phase-7-pr53-audit.md) through [`docs/phase-7-pr56-audit.md`](phase-7-pr56-audit.md); the original inventory at [`docs/phase-7-schema-audit.md`](phase-7-schema-audit.md).

**Important framing note:** Phase 7 was REDEFINED away from the old PHASE_STATE Phase 7 scope ("optional migration of legacy 49 NULL-status rows"). After Phase 6 closed cleanly, the next-highest-leverage work was widening the structured-data surface for SEO, not running a backfill.

**4 PRs merged:**
- **PR [#52](https://github.com/nonstophamzah/bufaisal-website/pull/52) (commit `14451d0`) — Merchant Listings eligibility.** Added `shippingDetails` (7 per-emirate entries: Ajman 85 / Sharjah 145 / UAQ 120 / Dubai 240 / RAK 240 / Fujairah 265 / Abu Dhabi 300 AED) + `hasMerchantReturnPolicy` (Appliances-only, 7-day finite window, `ReturnInStore` + `FreeReturn`) to Product JSON-LD via `augmentProductSchema()`. Both nest under `Offer`. 11 vitest cases in `src/__tests__/lib/augment-product-schema.test.ts`.
- **PR [#53](https://github.com/nonstophamzah/bufaisal-website/pull/53) (commit `45ffc90`) — 5-shop LocalBusiness split + Organization address completeness.** Replaced single collapsed LocalBusiness with 5 sibling entities (per-shop geo + GBP-sourced `aggregateRating` for 1,442 / 281 / 582 / 47 / 49 reviews = **2,401 total**). Added missing `streetAddress` + `addressRegion` + `postalCode='00000'` to root Organization in `layout.tsx`. Fixed pre-existing bugs: `openingHours` 22:00 → 23:00, `priceRange` `'AED'` → `'AED 50 - AED 5000'`. Data in `src/lib/local-business-schema.ts`.
- **PR [#54](https://github.com/nonstophamzah/bufaisal-website/pull/54) (commit `6ef93ce`) — ItemList SSR migration.** Moved `ItemList` JSON-LD on `/shop?category=*` from client-side to server-side; deleted the CSR `useMemo` in `shop-client.tsx`. `/shop` only — homepage `?category=` no longer emits ItemList as a side effect of the shared `ShopClient` deletion (Hamzah-accepted). Shape byte-identical to prior CSR.
- **PR [#55](https://github.com/nonstophamzah/bufaisal-website/pull/55) (commit `4723594`) — BreadcrumbList on /categories.** 2-level breadcrumb (Home → Categories). Position 2 carries `name` only, no `item` URL — matches the leaf convention in `/item/[id]/page.tsx`.

Closeout docs landed in PR [#56](https://github.com/nonstophamzah/bufaisal-website/pull/56) (commit `bdea681`).

**2 proposals rejected as vanity schema:**
- Organization-level `aggregateRating` — Google doesn't honor self-declared aggregateRating on Organization for SERP rich results (pulls from its own GBP data). Per-shop aggregateRating on LocalBusiness handles the 2,401 reviews instead. Rejected in PR #53's audit.
- CollectionPage on `/categories` — not in Google's rich-results gallery, no documented SERP benefit. Rejected in PR #56's audit; BreadcrumbList shipped alone as the audit-approved minimum fix.

**Schema emission map (post-Phase-7) — all server-side:**
| Route | SSR JSON-LD blocks |
|---|---|
| `/` | Organization + WebSite (inherited from `layout.tsx`); FAQPage |
| `/shop` | Organization + WebSite (inherited); 5× LocalBusiness; FAQPage |
| `/shop?category=*` | Same as `/shop` + ItemList for the category |
| `/categories` | Organization + WebSite (inherited); BreadcrumbList |
| `/item/[id]` | Organization + WebSite (inherited); augmented Product (with sku, url, category, seller, shippingDetails[7], hasMerchantReturnPolicy if Appliances); FAQPage; BreadcrumbList |

`/item/[id]` uses the locked `escapeJsonLd()` helper. Five other inline JSON-LD sites still use the simpler `replace(/</g, '\\u003c')` pattern (`layout.tsx`, `page.tsx`, `shop/page.tsx`, `categories/page.tsx`) — migrate when next touching those files.

---

### Phase 8 — Admin-override series
**Status:** 🚧 In progress. PR 1 of 3 merged; PR B + PR C parked pending two-week observation. Audit at [`docs/phase-8-admin-override-audit.md`](phase-8-admin-override-audit.md).

**Important framing note:** Phase 8 was REDEFINED away from the old PHASE_STATE Phase 8 scope ("daily summary endpoint + monitoring"). Per the PR #57 / #58 handoff: "Phase 8 redefined" is a locked decision.

**Background — the audit's finding.** Phase 1B created 17 admin override columns on `shop_items`, but the `/admin/pending/[id]` UI exposed only some of them, and the public site read some of those overrides while ignoring others. The audit's primary gap: `admin_price_aed` + `admin_negotiable` + `admin_condition_grade` had backend wiring (PATCH route accepts, validator accepts, eligibility logic counts them as overrides) but **no UI inputs** — and 6 public-site reads of price went straight to `item.sale_price` with no fallback chain.

**PR 1 of 3 — ✅ shipped 2026-05-15 as PR [#57](https://github.com/nonstophamzah/bufaisal-website/pull/57) (commit `1511d41`).**

Wired three admin overrides end-to-end without a schema migration:

*UI inputs added to `/admin/pending/[id]`:*
- **Price input** (integer AED) → `admin_price_aed`.
- **Negotiable Yes/No pills** → `admin_negotiable`. Pill style mirrors `/team`, scaled down.
- **Condition grade Excellent/Good/Fair pills** → `admin_condition_grade`. Only renders when `worker_condition_type === 'Used'`. Replaces the existing `<select>`.
- All three default to `admin_* ?? worker_*` and clear via "Worker submitted: X — Reset" (new `sourceLabel` prop on `FieldShell`). New `AdminPill` subcomponent.

*Public-site price propagation — 6 surfaces:*
New pure helper `src/lib/effective-fields.ts::getEffectivePrice(item)` chains `admin_price_aed ?? worker_price_aed ?? sale_price`. Wired into all 6 consumers:
1. `src/app/item/[id]/item-detail-client.tsx` — `SimilarItemCard` + main detail page
2. `src/app/marketplace-client.tsx` — homepage grid
3. `src/app/shop/page.tsx` — `ItemList` JSON-LD `offers.price`
4. `src/components/ItemCard.tsx` — shared card (homepage + shop feeds)
5. `src/app/api/feed/route.ts` — Facebook + Google product feeds (both formats)
6. `src/lib/constants.ts` — `buildWhatsAppUrl()` `💰 X AED` line

Analytics calls (`trackViewContent`, `trackWhatsAppClick`) intentionally stay on the legacy `item.sale_price` field per the CLAUDE.md "non-display reads stay on legacy fields" rule.

*Architectural fork — locked decision.* The audit Section 7 flagged the choice: add `published_price_aed` / `published_negotiable` / `published_condition_grade` columns and a Phase 6.5-style cutover, OR keep the `admin?? worker` fallback at render time and accept that override propagation has two patterns. **PR #57 chose the render-time fallback path** because the published_* columns do not exist (verified by live SQL) and adding them would have meant 3 new columns + 3 new resolver chains + a backfill. The published_* snapshot contract now covers text/SEO/schema fields; price/negotiable/condition_grade ride the render-time fallback. Acceptable per audit and scope.

*Tests:* 15 new vitest cases in `src/__tests__/lib/effective-fields.test.ts` covering the fallback chain, WhatsApp draft round-trip, schema-augmenter `admin_negotiable=false` behavior, and condition-grade resolution. Suite: 88 prior + 15 new = 103 / 106 green (3 pre-existing gemini.test.ts failures unrelated).

*Type additions:* `worker_price_aed`, `admin_price_aed` added to `ShopItem` in `src/lib/supabase.ts`. Columns existed in DB; pure additive type fix.

**PR 1 handoff addendum — currently open as PR [#58](https://github.com/nonstophamzah/bufaisal-website/pull/58)** (`docs/phase-8-pr1-handoff` branch, docs-only).

**What's left in Phase 8** (from the audit's recommended PR split):
- **PR B — `admin_condition_type` with regenerate-on-flip flow.** Schema migration adds `admin_condition_type text`. UI gets a Used/New selector. Backend PATCH learns the new field. When admin flips condition_type, prompt to regenerate the AI listing — flipping without regenerate leaves the SEO title prefix, description body, FAQ wording, trust signals, and `published_product_schema.itemCondition` stale. Audit §5.3 enumerates the cascade. Higher risk than PR A.
- **PR C — `admin_shop_id` + `admin_condition_notes` (minor).** Schema migration adds both columns. UI: `<select>` for shop reassignment (BF1–BF5 + clear), textarea for `admin_condition_notes`. Public-side: `item-detail-client.tsx`, `buildWhatsAppUrl()`, `fetchSimilarItems()` switch from `worker_shop_id` to `admin_shop_id ?? worker_shop_id`. Condition_notes display: `admin_condition_notes ?? condition_notes`. Audit §6 — accepts stale body copy in `published_description` / `published_geographic_anchor` rather than running a regenerate.

**Next planned action:** **passive observation for ~2 weeks** after PR #57 lands. Decision criteria (from PR #58 handoff): confirm admins actually use the price + negotiable + condition_grade inputs in production. If override usage rates are high, PR B and PR C are justified. If usage rates stay at zero (matching the audit's §2.3 baseline where 14 of 17 admin override columns showed 0 non-null rows across all 142 items in shop_items), the marginal value of adding two more override columns is unclear and PR B / PR C may be skipped or de-prioritized.

---

### Phase 9 — Cleanup (not started)

Per CLAUDE.md "Known Issues / Tech Debt" + the Hamzah Option A acceptance notes + outstanding tech debt below. Scope is the union of everything explicitly deferred to Phase 9 across the prior phases:

1. **Delete legacy `/api/jobs/generate-listing` route** — zero callers in current code. Filters strictly on `status='agent_drafting'` (no rows match anymore).
2. **Drop `JOBS_SECRET` env var** — only consumed by the legacy job route.
3. **Drop `agent_drafting` from the `ShopItem.status` TS union** — 0 rows match in production.
4. **Retire the legacy `/admin` Pending tab** completely — the `'pending'` value is kept in the `Tab` union and in `/api/admin/items` for backwards-compat with direct API callers (none in current code). Also retire the "→ New Pending [BETA]" link in the legacy admin nav once the new dashboard is the only flow.
5. **Migrate legacy `/admin` Live/Sold/Hidden tabs to canonical sources** — currently render items approved after 6.6 with blank product titles, empty categories, and no condition badges (`AdminItems.tsx` reads legacy columns directly). Hamzah-accepted regression carry-forward from Phase 6.6.
6. **Decide on the `mark_live` (Hidden → Live) and `unmark_sold` (Sold → Restore) admin actions.** Both currently set `is_published=true` without computing `published_*` — they're legitimate workflows for already-published items returning to Live, but if a fresh pending row ever leaks into Hidden, restoring it would publish without `published_*`. Lock the policy here.
7. **Drop the diagnostic-reference SQL files** — `supabase-backfill-image-columns.sql` (zero rows affected when run, kept as documentation); the v4 diagnostic cleanup pattern.
8. **Clean up the dangling `published_internal_link_targets` reference** in `admin-pending-publish.ts` `overrideKeys` list — the column does not exist in the migration (PR #45 derived similar-item tiers from `published_brand`/`published_category`/`worker_shop_id` instead).
9. **Drop legacy text columns from `shop_items`** — `item_name`, `brand`, `category`, `product_type`, `description`, `seo_title`, `seo_description`, `negotiable` — once `resolvePublicItemFields()` can be retired. Destructive; needs explicit migration with rollback plan.
10. **Retire `resolvePublicItemFields()`** once step 9 lands — the resolver's `published_X ?? legacy_X` fallback only exists for pre-Phase-5 rows on the legacy columns. After the columns drop, the resolver becomes dead code.

Sequence matters: steps 9 and 10 are coupled and destructive. Steps 1–8 are independent and can ship as small PRs.

---

## Workflow rules (carry forward to every phase)

Per memory `feedback_listing_generator_workflow.md`:

- **Approval is per step, not per phase.** Wait for "approved" / "proceed" before each step.
- **Default: PR + merge** (not direct fast-forward) for meaty phases. Hamzah did fast-forward for Phase 1, then PR + merge for Phases 3 onward.
- **Hamzah runs SQL migrations himself** in the Supabase SQL Editor. Claude produces the SQL file, commits, pushes, then waits for Hamzah's verification queries.
- **Companion docs win conflicts** with the implementation spec. If `Bufaisal-Decisions-Log-*.docx`, `Bufaisal-SEO-Agent-v1.0.docx`, or `Bufaisal-Listing-Generator-Prompt-*.md` disagree with the spec — stop and flag.
- **Sacred routes:** `/team`, `/admin`, `/admin/pending`, `/appliances`, `/api/appliances`, `/api/gemini`. Surgical edits only; never refactor end-to-end without explicit ask.
- **Scope discipline:** "two-line change" means two lines. Comment cleanup is Phase 9 material.

### Investigation rule: ground truth over screenshots
**Added 2026-05-10 after a wasted bug-chase that Phase 5 didn't actually have.**

When a bug is reported with screenshot- or memory-based symptoms:

1. **Read the actual route file first.** Find the SQL/update payload that supposedly does the wrong thing. Confirm what it actually writes vs what's reported.
2. **Read the actual DB row via service role.** What columns are populated, what's NULL, what the audit_log says about who did what when. The script `/tmp/dump-bug-rows.mjs` (Hamzah-side) reads creds from `.env.local` + `.env.production.local`.
3. **Check the audit_log timeline.** Reconstruct what happened from `before_state`/`after_state` diffs. If a transition exists in the data but not in the audit trail, suspect legacy actions (legacy `/api/admin/items` doesn't write audit_log).
4. **Only then write code.** If steps 1-3 contradict the report, push back with the evidence rather than building a fix for a non-existent bug.

The 2026-05-10 case: three bugs reported in `/admin/pending` (list shows wrong rows, reject sets `is_sold=true`, reject doesn't write audit_log). All three were screenshot-inferred. The actual code was correct on all three counts.

**Corollary added later same day**: when the screenshot symptom turns out to be REAL on a fresh device after long elapsed time, the investigation rule still applies — but the answer may be deeper than the route handler. In that case it was Vercel CDN serving a stale response without invoking the function. Diagnosis required deploying temporary diagnostic logging into `audit_log` because we couldn't read Vercel runtime logs from this side. Three iterations: v1 captured the response, v2 returned zero entries (the function never fired), v3 added a heartbeat at the top of the function plus explicit `Cache-Control: no-store` — entries reappeared while the bug went away. Lesson: when reported symptoms reproduce on a fresh device after long elapsed time, suspect caching at every layer (CDN, browser, edge) — not just route logic.

### Cache-Control rule: dynamic ≠ uncached (and `force-dynamic` does NOT imply `fetchCache`)
**Added 2026-05-10 after the CDN cache-poisoning incident, REVISED same day after PR #33 turned out to be incomplete.**

There are TWO independent caches that can serve stale data on a Next.js App Router API route:

**Cache layer 1 — CDN/browser** (response header). Next.js's default response header for dynamic routes is `Cache-Control: public, max-age=0, must-revalidate`. Vercel's CDN edge and iOS Safari Mobile interpret this permissively and DO cache. Fix: explicit `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` on the response. Set globally in `src/middleware.ts` for every `/api/*` except `/api/feed`. (PR #33 fixed this layer.)

**Cache layer 2 — Next.js Data Cache** (the supabase-js `fetch()` calls inside the handler). Next.js docs claim `dynamic = 'force-dynamic'` implies uncached data fetching, but **in practice on Vercel that implication does NOT hold for fetches issued by third-party libraries (supabase-js)**. The route handler may receive cached PostgREST responses internally even though the OUTER response correctly has `Cache-Control: no-store`. (PR #34 fixed this layer.)

**The full belt-and-braces stack** required for an auth-gated dynamic API route that uses supabase-js (see `src/app/api/admin/pending/route.ts` for the canonical example):

```ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { unstable_noStore as noStore } from 'next/cache';

export async function GET(request) {
  noStore();

  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' as RequestCache }),
    },
  });

  const { data } = await client.from(...).select(...).eq(...);

  return NextResponse.json(
    { items: data },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}
```

Six layers, all needed. Removing any one will cost hours of debugging.

Three things to remember:
1. **`dynamic = 'force-dynamic'` is necessary but not sufficient — for EITHER cache layer.** Trust the docs at your peril; verify empirically.
2. **Route-handler response headers win over middleware-set headers** when the same key is set in both, so middleware gives the default and route handlers can override (this is how `/api/feed` keeps its 1-hour cache despite the middleware rule).
3. **POST endpoints are technically less likely to be CDN-cached** per HTTP semantics, but defensive `no-store` is cheap and prevents future Vercel-edge-case surprises.

**The 6-hour debugging cost on 2026-05-10**: PR #33 was shipped and verified at the WIRE level (curl confirmed `Cache-Control: no-store` on responses). I extrapolated "wire-level fix is correct" → "bug is fixed". Wrong. The Next.js Data Cache (layer 2) was still serving stale data INSIDE the handler. Hamzah caught this when an incognito session on a different browser engine still showed stale data. Lesson: when claiming a cache fix works, verify the actual auth'd response BODY (via diagnostic audit_log INSERT or a session-token-equipped curl), not just response headers.

---

## Outstanding tech-debt items

Refreshed 2026-05-17. Items below are non-blocking — none of them prevent Phase 8 PR B / PR C or Phase 9 from starting.

1. **Phase 6 `published_product_schema` coverage gap.** Of the **69 currently published rows** (`is_published=true`), only **14** have a non-null `published_product_schema`. The remaining 55 emit no Product JSON-LD on `/item/[id]`. Backfilling via `src/scripts/process-backlog.ts --force` is the single biggest carry-forward SEO opportunity from Phase 7. Not started.
2. **Pre-existing 3 failing tests in `src/__tests__/api/gemini.test.ts`** — predate Phase 3, unrelated to the listing pipeline. Likely a mocking issue with `@anthropic-ai/sdk`. Touch in passing when next editing the gemini route or its tests.
3. **`/api/jobs/generate-listing` legacy route** — zero callers in current code. Safe to delete in Phase 9 step 1.
4. **`JOBS_SECRET` env var** — only consumed by the legacy job route. Drop in Phase 9 step 2.
5. **`agent_drafting` status value** — still in the TS union for any in-flight legacy rows. 0 rows match in production. Drop in Phase 9 step 3.
6. **Dangling `published_internal_link_targets` reference** in `admin-pending-publish.ts` override keys list — column does not exist. Cleanup in Phase 9 step 8.
7. **Five inline JSON-LD sites still use the simpler escape pattern.** `layout.tsx`, `page.tsx`, `shop/page.tsx`, `categories/page.tsx` use `replace(/</g, '\\u003c')` instead of the locked `escapeJsonLd()` helper. Migrate when next touching those files; not urgent.
8. **Shops D + E share GPS coordinates** (`25.3994663, 55.4993168`) in `local-business-schema.ts` — physically adjacent units; distinct names + `sameAs` GBP URLs disambiguate them for Google.
9. **`condition_notes` has no `published_*` counterpart.** `/item/[id]` reads `item.condition_notes` directly. Worker-controlled free-text field; can stay legacy (or move to Phase 8 PR C scope).
10. **`mark_live` / `unmark_sold` admin actions** still set `is_published=true` without computing `published_*` (Phase 9 step 6).
11. **WhatsApp draft emoji rendering** — Issue [#48](https://github.com/nonstophamzah/bufaisal-website/issues/48). Draft body shows replacement chars instead of 📦 💰 📍 on WhatsApp Web. Source bytes verified byte-identical to correct UTF-8 and unchanged across Phase 6.5b.1; cause is downstream. Low priority. The WhatsApp number migration playbook is at [`docs/whatsapp-number-migration-playbook.md`](whatsapp-number-migration-playbook.md) (commit `0fee822`, 2026-05-16).
12. **Unescaped user input in `.or(…ilike…)` interpolation** at `src/app/page.tsx`, `src/app/shop/page.tsx`, `src/app/shop/shop-client.tsx`. PostgREST escapes URL operands but `,` or `)` in the search term could in theory confuse the filter parser. Low-severity hardening.
13. **CLAUDE.md known-issues #1, #2, #7, #10** about marketplace using anon Supabase from `/admin` — unchanged through Phases 1–8. Slated for Phase 9 alongside the legacy `/admin` migration.

### Production baselines for future cutovers

- **2026-05-12 (end of Phase 6.5):** 49 publicly visible rows; 0 pending; 4 hidden; 122 total in `shop_items`. Per-category: Appliances 6, Bedroom 12, Everyday 1, Kids/Baby 1, Kitchen/Dining 9, Living Room 16, Office 2, Outdoor 2.
- **2026-05-14 (start of Phase 8 audit):** 142 total rows in `shop_items` (15 published / 11 pending / 54 NULL / 62 archived). 69 currently published (`is_published=true`), of which 14 have `published_product_schema`. Out of 17 editable admin override columns, only 4 had ever been written: `admin_approved_at` / `admin_approved_by` (16 rows each — approval metadata, not user-edited fields), `admin_spec_table` (7 rows), `admin_trust_signals` (5 rows). All 14 user-editable text fields and the 3 new Phase 8 fields had 0 non-null entries pre-PR-#57 — the empirical baseline against which Phase 8 PR 1 observation will be judged.

---

## Change log for this file

- **2026-05-17:** Brought ledger up to current main. Added Phase 6.5b.1 (PR #47), 6.5b.2 (PR #49), 6.6 (PR #50). Added complete Phase 7 ledger entry (PRs #52, #53, #54, #55, #56 — schema upgrades, NOT the old "legacy backfill" Phase 7 scope). Added Phase 8 in-progress entry (PR #57 merged, PR #58 open) with PR B + PR C scope captured verbatim from the audit. Phase 9 scope reformulated as a 10-step list rather than the old "Cleanup" one-liner. Outstanding tech debt refreshed (added Phase 7 carry-forward items: 55-row schema coverage gap, 5 escape-pattern sites, WhatsApp playbook reference). Added top-of-file "Where we are right now" summary.
- **2026-05-12 (last update before today):** Phase 6.4 PR A (#44) and PR B (#45) both shipped to main. Public `/item/[id]` fully cut over to `published_*` columns for text + JSONB. Sub-phase ledger added (6.0 → 6.5) with explicit status per sub-phase.
- **2026-05-11:** Phase 6.3 shipped (PR #40 at `67cbd29`). Resolver `src/lib/resolve-public-item-fields.ts` introduced.
- **2026-05-10 (final entry that day):** Phase 5 VERIFIED end-to-end (PR #34). Six-layer cache-defeat stack added to `/api/admin/pending/route.ts`. Cache-Control rule above REVISED to document both cache layers.
- **2026-05-10 (mid-day):** Cache-Control fix shipped (PR #33). Reverted PRs #30/#31/#32 (the temp diagnostics). Added the Cache-Control rule above.
- **2026-05-10 (earlier):** Three follow-up items shipped (PR #29): detail GET 409 for non-pending, list view auto-refresh on visibilitychange, archived+sold cleanup SQL. Investigation rule added above.
- **2026-05-10 (start of day):** Phase 5 marked complete (PR #26). Image-optimizer hotfix record added (PR #27). Phase 5 follow-up: legacy /admin Pending tab removed.
- **2026-05-09:** Phase 4 marked complete. Added admin-approve bug record (PR #24). Added Phase 5 carryforward notes.
