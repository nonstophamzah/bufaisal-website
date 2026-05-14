# HANDOFF — BUFAISAL PHASE 7 COMPLETE (2026-05-14)

For the next Claude session (or any new contributor) picking up after Phase 7. Reading time: under 30 minutes.

---

## 1. Project context

Bufaisal is a UAE-based second-hand goods business running 5 physical showrooms in Al Jurf, Ajman, plus a repair warehouse in Jurf. Established 2009. The website at `bufaisal.ae` is a Next.js 14.2 App Router platform that hosts both the public marketplace and an internal appliance-tracking operations system at `/appliances`. Customers browse items on the marketplace and complete the purchase via WhatsApp (`+971585932499`); inventory turns over fast because every item is unique stock.

Repo: `https://github.com/nonstophamzah/bufaisal-website`. Hosted on Vercel. Database is Supabase (Postgres + RLS). AI listing generation runs through Anthropic Claude — `claude-sonnet-4-6` for full Product schema generation, `claude-haiku-4-5` for barcode/image OCR. The legacy `/api/gemini` endpoint name is preserved for backwards compatibility — it's actually Haiku, not Gemini, since the PR #11 migration.

Owner: **Hamzah**, working remotely from Honduras (timezone UTC-6). He operates as the product, design, and engineering lead. The work model is solo + AI: Hamzah scopes, audits decisions, and runs production verification. Sessions are conducted via Claude Code with strict scope discipline.

---

## 2. What just shipped — Phase 7 (complete)

Four PRs merged to `main` over a single multi-session run. All four passed Vercel preview verification and Hamzah's RRT spot-checks before merge. Phase 7's scope was SEO/AEO/GEO structured-data widening — taking the public site from "5 valid schema items with 3 warnings" to "comprehensive Product / LocalBusiness / breadcrumb coverage."

### PR #52 — Merchant Listings eligibility ([GH #52](https://github.com/nonstophamzah/bufaisal-website/pull/52))

- **Branch:** `phase-7/pr-53-merchant-listings`
- **Merged:** 2026-05-13T14:39:09Z
- **Files:** `src/lib/augment-product-schema.ts` (+59 LOC), `src/__tests__/lib/augment-product-schema.test.ts` (+183 LOC new file)
- **What:** Added `shippingDetails` (array of 7 per-emirate entries) and `hasMerchantReturnPolicy` (Appliances-only, 7-day finite window) to the Product JSON-LD via the render-time augmenter. Both nest under `Offer`, not top-level Product.
- **Unlocks:** All published Appliance rows now eligible for Google Merchant Listings rich result. Non-Appliance Product rows get shipping data (still useful for Google Shopping eligibility) but no return policy (in-shop inspection, sold as-is).
- **Key decisions:**
  - Shipping shape: Google's `MonetaryAmount.shippingRate` accepts only a single `value` per entry — ranges aren't supported. We initially shipped `value: 50` floor then updated mid-PR to **per-emirate array of 7 entries** with distinct rates: Ajman 85, Sharjah 145, Umm Al Quwain 120, Dubai 240, Ras Al Khaimah 240, Fujairah 265, Abu Dhabi 300 AED. `addressRegion` is the emirate name as plain Text (Google's docs accept this — their own example uses `["NY"]` for US state).
  - Non-Appliance return policy: **omit entirely** rather than emit `MerchantReturnNotPermitted`. Hamzah's call — clearer signal than negative return policy.
  - `ReturnInStore` + `FreeReturn` enums (verified against Google's enum list for 7-day appliance returns).
- **Tradeoff:** The "any fault on Bufaisal's end → replacement" goodwill commitment has no schema primitive — left in customer copy, not encoded.
- **Audit:** [`docs/phase-7-pr53-audit.md`](docs/phase-7-pr53-audit.md).

### PR #53 — 5-shop LocalBusiness split + Organization address ([GH #53](https://github.com/nonstophamzah/bufaisal-website/pull/53))

- **Branch:** `phase-7/pr-54-localbusiness-split`
- **Merged:** 2026-05-14T03:18:43Z
- **Files:** `src/lib/local-business-schema.ts` (+142 LOC new file), `src/app/layout.tsx` (+3 LOC for `streetAddress` / `addressRegion` / `postalCode`), `src/app/page.tsx` (-20 LOC), `src/app/shop/page.tsx` (-23 LOC).
- **What:** Replaced the single collapsed LocalBusiness block with **5 separate sibling LocalBusiness entities**, one per shop, each carrying its own GBP coordinates, address, per-shop `aggregateRating`, and `sameAs` GBP URL. Cross-referenced to root Organization via `parentOrganization`. Added missing Organization address fields to clear the active "Org address incomplete" warning.
- **Unlocks:** Cleared the Organization address warning. Each shop's GBP review count (1,442 / 281 / 582 / 47 / 49 — **2,401 total**) now surfaces in structured data for AEO/GEO grounding. Distinct shop identities for AI search engines and Knowledge Panel.
- **Key decisions:**
  - **Per-shop `aggregateRating`: YES** (honest, GBP-sourced). Google's "self-serving reviews" policy was flagged in the audit but the data is independently sourced (Google's own review system) so the risk is low.
  - **Organization-level `aggregateRating`: NO** — Google doesn't honor it for SERP rich results. Adding it would be vanity schema.
  - `postalCode: "00000"` placeholder per UAE convention. Google's parser requires postalCode to clear the warning; omitting it leaves the warning active.
  - Fixed two pre-existing bugs: `openingHours` was `"Mo-Su 09:00-22:00"` (actual hours run to 23:00) and `priceRange` was `"AED"` (now `"AED 50 - AED 5000"`).
  - Shop E's `streetAddress` initially used a tenant business name ("Royal Diamond Printing Press LLC") — replaced with the actual road name "Al Khail Street, Al Jurf 2" for schema correctness.
- **Tradeoff:** Shops D + E share GPS coordinates (`25.3994663, 55.4993168`) because the units are physically adjacent. Distinct names, distinct `sameAs` GBP URLs, and the audit confirmed this is fine — Google disambiguates via the GBP URLs.
- **Audit:** [`docs/phase-7-pr54-audit.md`](docs/phase-7-pr54-audit.md).

### PR #54 — ItemList SSR migration ([GH #54](https://github.com/nonstophamzah/bufaisal-website/pull/54))

- **Branch:** `phase-7/pr-55-itemlist-ssr`
- **Merged:** 2026-05-14T03:45:24Z
- **Files:** `src/app/shop/page.tsx` (+51 LOC), `src/app/shop/shop-client.tsx` (-45 LOC, deleted CSR block + 3 unused imports).
- **What:** Moved the `ItemList` JSON-LD on `/shop?category=*` from client-side rendering to server-side. CSR block deleted in the same commit to prevent duplicate emission.
- **Unlocks:** Googlebot now sees the category-page item carousel signal in initial HTML — no JS execution required. The schema shape is byte-identical to the prior CSR output (same fields, same gates, same `.slice(0,10)` cap).
- **Key decisions:**
  - **`/shop` only, NOT homepage `/`** — `/shop?category=X` is the canonical category surface; homepage `?category=X` URLs lose the ItemList signal as a side effect of the shared `ShopClient` deletion, which Hamzah accepted.
  - **Inline Product per ListItem** (not URL-only) — zero-behavior-change was the goal. URL-only would be a smaller payload but the audit found Google's docs don't prefer either pattern for Product, and inline keeps the change atomic.
  - Gate preserved: emit only when `catName` truthy AND `items.length > 0`. No emission on the unfiltered `/shop` view.
- **Tradeoff:** Google's carousel docs **don't list Product as a carousel-eligible content type** (Course / Movie / Recipe / Restaurant only). The schema's value is crawl-time signal, not a SERP carousel widget. The audit was honest about this; the PR shipped anyway because the cost was tiny and the AEO/GEO grounding value is real even if SERP carousel isn't.
- **Audit:** [`docs/phase-7-pr55-audit.md`](docs/phase-7-pr55-audit.md).

### PR #55 — BreadcrumbList on /categories ([GH #55](https://github.com/nonstophamzah/bufaisal-website/pull/55))

- **Branch:** `phase-7/pr-56-categories-breadcrumb`
- **Merged:** 2026-05-14T04:14:04Z
- **Files:** `src/app/categories/page.tsx` (+23 / -3).
- **What:** Added a 2-level BreadcrumbList JSON-LD block (Home → Categories) in SSR.
- **Unlocks:** `/categories` now eligible for Breadcrumb rich result in SERP. Closes the schema gap the original audit flagged.
- **Key decisions:**
  - Position 2 (current page) carries `name` only, **no `item` URL** — Google's documented leaf convention, matches the existing `/item/[id]` pattern.
  - Escape pattern: `replace(/</g, '\\u003c')` (simpler form used by sibling SSR emissions in `shop/page.tsx`, `layout.tsx`).
- **Tradeoff:** The audit originally scoped this PR as "CollectionPage + BreadcrumbList" but recommended skipping CollectionPage (see below).
- **Audit:** [`docs/phase-7-pr56-audit.md`](docs/phase-7-pr56-audit.md).

### Rejected proposals

**Two schema additions were explicitly rejected during Phase 7 audits.** Documented here so future sessions don't reflexively propose them again:

1. **Organization-level `aggregateRating`** (originally proposed as "PR #52 first win" in `docs/phase-7-schema-audit.md`). Rejected during PR #53's audit (`docs/phase-7-pr54-audit.md` Section 3): Google doesn't honor self-declared `aggregateRating` on `Organization` for SERP rich results — it pulls from its own GBP data. Adding it would be vanity schema. The 2,401 reviews are surfaced via per-shop `LocalBusiness.aggregateRating` instead, which Google does honor.

2. **`CollectionPage` schema on `/categories`** (originally proposed as PR #56 scope). Rejected during PR #56's audit (`docs/phase-7-pr56-audit.md` Section 5 explicit "SKIP" verdict): CollectionPage is NOT in Google's rich-results gallery — no documented SERP benefit, no measurable AEO/GEO impact. Shipping it would be vanity schema. BreadcrumbList shipped alone as the audit-approved minimum viable fix for the gap.

---

## 3. Post-Phase-7 schema architecture state

### Schema emission map per route

| Route | Schema blocks (SSR HTML) | Source |
|---|---|---|
| `/` (homepage) | Organization, WebSite (inherited from `layout.tsx`); FAQPage (page-level) | `layout.tsx` + `page.tsx` |
| `/shop` | Organization, WebSite (inherited); 5× LocalBusiness; FAQPage; ItemList (when `?category=` set) | `layout.tsx` + `shop/page.tsx` |
| `/shop?category=*` | Same as `/shop` + ItemList for the category | `shop/page.tsx` |
| `/categories` | Organization, WebSite (inherited); BreadcrumbList | `layout.tsx` + `categories/page.tsx` |
| `/item/[id]` | Organization, WebSite (inherited); Product (augmented at render), FAQPage, BreadcrumbList | `layout.tsx` + `item/[id]/page.tsx` |

All page-level schemas are **server-side emitted**. The only client-side JSON-LD in the codebase was the prior `/shop` ItemList, which PR #54 removed.

### Canonical sources of truth

- **Product data**: `published_product_schema` (JSONB on `shop_items`) → augmented at render time via `augmentProductSchema()` → injected as `<script>` block on `/item/[id]/page.tsx`.
- **LocalBusiness data**: `src/lib/local-business-schema.ts` exports `LOCAL_BUSINESS_SCHEMAS` — a static array of 5 shop entities. Single source of truth for `/` (legacy reference, no emission post-PR-53) and `/shop`.
- **Shop physical metadata**: `src/lib/shops.ts` (`SHOPS` record) — keyed by `BF1`–`BF5`, used for canonical shop name lookup, GBP map URLs, and the `getShop(workerShopId)` resolver consumed by `/item/[id]`, `ItemCard`, and `buildWhatsAppUrl`.
- **Text field resolution for legacy fallback**: `src/lib/resolve-public-item-fields.ts` (`resolvePublicItemFields()`) — pattern `published_X ?? legacy_X`. Still load-bearing for the 46 pre-Phase-5 legacy rows that have `published_*` columns as NULL.
- **Image fallback chain**: `src/lib/item-image.ts` (`getItemImageUrl`, `resolveItemImageUrl`, `getAllItemPhotos`). Order: `thumbnail_url > image_urls[0] > worker_photo_brand_url > /og-image.png`.

### Helper file inventory (post-Phase-7)

```
src/lib/
├── augment-product-schema.ts        # Product render-time augmentation (Phase 6.4 + Phase 7 PR #52 extensions)
├── local-business-schema.ts         # NEW in Phase 7 PR #53 — the 5-shop registry
├── resolve-public-item-fields.ts    # Phase 6.3 — text-field fallback resolver
├── resolve-schema-images.ts         # Phase 6.4 — placeholder `image[]` substitution
├── similar-items.ts                 # Phase 6.4 PR B — tiered related-products query
├── shops.ts                         # Phase 6.4 PR B — canonical shop config
├── item-image.ts                    # PR #27 — image URL fallback chain
├── cloudinary-loader.ts             # PR #27 — custom next/image loader
└── ... (other non-schema helpers)
```

Every helper is a **pure function** (no I/O, no React, no module-level state). The pattern is now well-established: new public-side concerns get their own file in `src/lib/`, never bloat an existing resolver.

---

## 4. Known operational state (not bugs — known behavior)

Items already considered and explicitly accepted. Future sessions should treat these as the operational reality, not "bugs to fix unprompted."

- **`admin_price_aed` and `admin_negotiable` overrides don't propagate to the public site.** Worker insert populates `sale_price` and `negotiable` once at submit; the mirror block (deleted in Phase 6.6 / PR #50) was the only writer that overwrote them with admin overrides. With the mirror gone, those overrides stop at the `admin_*` column. Public site renders the worker-submitted price and negotiable flag. Fix scoped for a future PR if/when admin overrides become an active workflow need.
- **46 of 49 currently-visible rows have NULL `published_product_schema`** (pre-Phase-5 legacy rows). They emit no Product JSON-LD at all on `/item/[id]` (augmenter returns `null`, `<script>` tag skipped). Phase 7's Product schema additions only affect the 3 Appliance rows that DO have stored Product JSON-LD. Backfilling the 46 legacy rows is a candidate post-Phase-7 task — see Section 6.
- **Legacy `/admin` Live/Sold/Hidden tabs render new approvals with blank fields.** `AdminItems.tsx` reads `item.item_name`, `item.category`, `item.condition` directly — those legacy columns are `''` / `''` / `null` for post-6.6 approvals. Locked workflow is `/admin/pending`; items remain identifiable by photo + price + shop. Migration of legacy `/admin` to canonical sources deferred to Phase 9.
- **Legacy `/admin` Edit form** still writes to legacy columns only (`action='edit'` at `src/app/api/admin/items/route.ts:180-199`). Those edits no longer surface on the public site. Admins must use `/admin/pending` re-approval for edits that need to reach customers.
- **Shops D + E share GPS coordinates** (`25.3994663, 55.4993168`) in `local-business-schema.ts`. Physically adjacent units. Distinct names and `sameAs` GBP URLs disambiguate them for Google. Deliberate, verified by Hamzah.
- **`openingHours` was a pre-existing bug**: the codebase had `Mo-Su 09:00-22:00`, but actual hours run to 23:00. Fixed across the 5 LocalBusiness blocks in PR #53. If any other file still references the old hours string, it needs the same fix.
- **5 inline JSON-LD sites use the simpler `replace(/</g, '\\u003c')` escape** instead of the locked `escapeJsonLd()` helper in `src/app/item/[id]/page.tsx`. Migration is housekeeping; not urgent.

---

## 5. Open issues NOT yet addressed

- **[GitHub #48](https://github.com/nonstophamzah/bufaisal-website/issues/48) — WhatsApp draft body shows replacement chars (�) instead of 📦 💰 📍 emojis.** Pre-existing. Source bytes verified byte-identical to correct UTF-8 (`F0 9F 93 A6` etc.). Cause is downstream — likely `encodeURIComponent` interaction with `wa.me` handler, or font/rendering on certain client OS. Low priority; product info still renders without the emojis.
- **`admin_price_aed` propagation gap** — described above. Becomes a real problem the day admin price overrides become a live workflow.
- **Legacy `/admin` UI cleanup deferred to Phase 9.** Both the read side (blank titles in Live/Sold/Hidden tabs) and the write side (Edit form writes to legacy columns only). Either fix it in a dedicated cleanup PR or wait for the Phase 9 schema-drop migration to force the issue.
- **Suspicious product price data flagged by Hamzah** — e.g. a laptop stand listed at AED 4500. These are data-quality issues (incorrect prices entered at worker submit time, propagated through publish). Not a code bug. Candidate for a manual cleanup pass or an admin-side validation rule (future PR).
- **Unescaped user input in `.or(…ilike…)` interpolation** at `src/app/page.tsx`, `src/app/shop/page.tsx`, `src/app/shop/shop-client.tsx`. Pre-existing. PostgREST escapes URL operands but `,` or `)` in the search term could theoretically confuse the filter parser. Low-severity hardening; not exploitable for data exfiltration as far as the audit found.

---

## 6. What's next — post-Phase-7 options

Ranked by honest payoff. **No vanity items.**

| # | Option | Effort | Payoff | Notes |
|---|---|---|---|---|
| 1 | **Watch SEO results in Google Search Console for 30 days.** | Zero | High signal | Phase 7 added significant schema. Wait for Google to re-crawl + index before adding more. Look for: Merchant listing impressions, breadcrumb appearances, Org gold-star uplift, AI Overview citations. No code work needed; passive observation. |
| 2 | **Fix WhatsApp emoji bug** ([Issue #48](https://github.com/nonstophamzah/bufaisal-website/issues/48)). | S (1–2h) | Medium | Customer-facing polish. The root cause is likely on the WhatsApp handler side (URL encoding vs UTF-8 handling). Worth debugging in DevTools against `wa.me` / `whatsapp://` schemes. |
| 3 | **Fix `admin_price_aed` propagation.** | S (2–3h) | Medium-conditional | Only relevant if/when admin overrides become an active workflow. Right now they're dormant. Solve when needed. |
| 4 | **Backfill the 46 legacy non-Appliance Product JSON-LD blocks.** | M (4–6h) | High | This is the single biggest SEO opportunity remaining. Re-run the Phase 4 listing-generator pipeline on the 46 pre-Phase-5 rows so they get `published_product_schema` populated. Existing infrastructure handles this — see `src/scripts/process-backlog.ts` (`--force` mode). Schema lift would multiply Phase 7's reach by ~15x (3 → 49 rows with Product schema). |
| 5 | **Audit `/admin` legacy UI for blank-field cleanup.** | M (4–8h) | Low-medium | The blank titles on Live/Sold/Hidden tabs are operationally tolerated. Cleanup is housekeeping. Wait for Phase 9 (legacy-column drop migration) to force the change, OR ship a focused PR that swaps the reads to `published_X ?? legacy_X`. |
| 6 | **Data cleanup pass for suspicious prices.** | M (2–4h depending on volume) | Medium | The laptop-stand-at-AED-4500 type errors. Either manual SQL fixes (Hamzah-run) or an admin-side validation rule (future code PR — e.g. flag any price > 3× category median for re-review). |
| 7 | **Phase 8 — daily summary endpoint** (per `docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md`). | M-L (depending on scope) | Conditional | Spec-defined but not yet broken into PR-sized chunks. Read the implementation spec's Phase 8 section before scoping. |
| 8 | **WhatsApp bot.** | L (~4 weeks per Hamzah's prior estimate) | High but large lift | Hamzah has prior conversation context on this (designed in earlier sessions; details in his head + possibly in memory files). **The next session should ask Hamzah to brief on this before starting** — the design isn't fully captured in repo docs. Significant scope shift from the marketplace-polish track Phase 7 was on. |

**Recommendation:** start with option 1 (passive — let Phase 7 results land in Search Console). Combine with option 2 (small win) while waiting. Then evaluate option 4 (legacy schema backfill) as the next material SEO move. Don't start option 8 (WhatsApp bot) without a fresh scoping conversation with Hamzah.

---

## 7. Key files (post-Phase-7 landmarks)

### Schema helpers
- [`src/lib/augment-product-schema.ts`](src/lib/augment-product-schema.ts) — Product render-time augmenter. Now emits `sku`, `url`, `category`, `seller`, negotiable hint, `shippingDetails` (7-entry array), `hasMerchantReturnPolicy` (Appliances only). 11 vitest cases in `src/__tests__/lib/augment-product-schema.test.ts`.
- [`src/lib/local-business-schema.ts`](src/lib/local-business-schema.ts) — `LOCAL_BUSINESS_SCHEMAS` array of 5. Shared between `page.tsx` and `shop/page.tsx`.
- [`src/lib/resolve-public-item-fields.ts`](src/lib/resolve-public-item-fields.ts) — `resolvePublicItemFields()`. Pattern `published_X ?? legacy_X`.
- [`src/lib/resolve-schema-images.ts`](src/lib/resolve-schema-images.ts) — placeholder image substitution at publish time.
- [`src/lib/shops.ts`](src/lib/shops.ts) — `SHOPS` record + `getShop()`.
- [`src/lib/similar-items.ts`](src/lib/similar-items.ts) — tiered related-products query.
- [`src/lib/item-image.ts`](src/lib/item-image.ts) — image fallback chain.

### Public page emission sites
- [`src/app/layout.tsx`](src/app/layout.tsx) — Organization (with full address as of PR #53) + WebSite. Inherited by every route.
- [`src/app/page.tsx`](src/app/page.tsx) — homepage. Emits the 5 LocalBusiness blocks + FAQPage.
- [`src/app/shop/page.tsx`](src/app/shop/page.tsx) — `/shop`. Emits 5 LocalBusiness + FAQPage + ItemList (when `?category=` set).
- [`src/app/categories/page.tsx`](src/app/categories/page.tsx) — `/categories`. Emits BreadcrumbList.
- [`src/app/item/[id]/page.tsx`](src/app/item/[id]/page.tsx) — `/item/[id]`. Emits augmented Product + FAQPage + BreadcrumbList. **Uses the locked `escapeJsonLd()` helper** (line 73–77).

### Sacred routes — DO NOT touch without explicit user permission

These have non-obvious invariants not fully captured in code. Routes that "stop and ask first" applies to:

- `/team` — worker upload portal (Phase 3 locked pill design, shop-floor flow)
- `/admin` — legacy admin dashboard (settings, analytics, Live/Sold/Hidden tabs)
- `/admin/pending` — Phase 5 admin pending dashboard
- `/appliances` and nested `/appliances/*` — internal appliance ops system. The rename to `/appliance-tracker` is locked per Decisions Log 2026-05-01 but parked on branch `v2-migration-foundation`, not yet on main
- `/api/appliances` — internal API for the appliance tracker
- `/api/gemini` — Claude Haiku image analysis (legacy endpoint name; serves appliance tracker barcode scan + diesel route OCR)

"Stop and ask" includes type-safety knock-ons: even a `ShopItem` interface change that ripples into `/admin` is a touch that needs approval.

---

## 8. Hamzah's preferences

Match these from day one of the next session — they were stable across all of Phase 6 and Phase 7:

- **Direct, fast, informal.** No marketing language. No "I'd be happy to..." prefaces. Short responses unless detail is requested.
- **One clear next step at a time, wait for confirmation.** Don't batch decisions. Don't speculate beyond the immediate ask.
- **Push back on bad plans.** Hamzah explicitly called this "ruthless mentor" mode. If a proposal has a flaw, say so directly. The cost of pushing back on a flawed plan is much lower than implementing it.
- **Investigate and conclude directly rather than asking Hamzah to verify steps himself.** Don't ask "could you check X?" when you have grep + Read + Bash. Verify, then report.
- **Verify with SQL/code reads before claiming state.** Memory entries can go stale. Read the code, then speak.
- **Simpler explanations when Hamzah says "I don't understand."** Drop the jargon, draw the picture in plain English. He's smart but he's not a career engineer.
- **Preview verification BEFORE merge, every time.** Every Phase 7 PR followed: open PR → push to branch → wait for Vercel preview → Hamzah hits the preview URL + RRT → THEN merge. Never merge without Hamzah's explicit "merge" green light.
- **Match his honesty about tradeoffs.** When the audit said "this is vanity schema, skip it," Hamzah agreed and the rejected proposals stayed rejected. Don't soften unfavorable findings.

---

## 9. How the session should run

The pattern that worked across all 4 Phase 7 PRs:

1. **Scope conversation** — Hamzah names the next item (e.g. "Merchant Listings eligibility"). Brief informal back-and-forth on what's in scope.
2. **Stress-test** — push back on anything that doesn't make sense. If the proposal is small enough to ship without an audit, say so. If it has hidden complexity, name it.
3. **Design** — produce a tight written design (2-3 paragraphs) covering what changes, where, and the key decisions. Get Hamzah's lock on the design.
4. **Audit prompt** — Hamzah writes a structured audit prompt with the questions to answer and the constraints. The audit prompt explicitly forbids code changes.
5. **Audit** — delegate to a fresh `general-purpose` agent in a separate context. Read-only. WebFetch Google's docs. Produce `docs/phase-7-pr<N>-audit.md` as the single deliverable. Return a 3-line summary.
6. **Audit review** — Hamzah reads the audit. May ask follow-up questions or override findings. The audit is data, not a decree.
7. **Implementation prompt** — Hamzah writes a structured implementation prompt that locks every decision (shape, fields, escape pattern, gate logic). Includes verification steps and the commit message.
8. **Implementation** — write code. Run build + tests + `next start` + curl SSR verification. Generate the PR description with sample output.
9. **Commit** — atomic commits with the exact message Hamzah specified. Co-authored line. No combined commits across unrelated concerns.
10. **PR opened, NOT merged.** Hamzah verifies the Vercel preview deploy + Google Rich Results Test before merging.
11. **Merge** — Hamzah merges. Production verification follows.

**Each step has an explicit hand-off back to Hamzah.** Don't auto-continue. The discipline is what kept Phase 7 from sprawling.

---

## 10. Recommended first prompt for next session

Copy-paste-ready. Keep it short:

> Hi. Phase 7 closed yesterday — all 4 PRs merged (Merchant Listings, 5-shop LocalBusiness split + Org address, ItemList SSR, /categories BreadcrumbList). Read `docs/phase-7-handoff.md` first.
>
> Quick status check before we pick the next move:
>
> 1. Anything broken in production over the last 24 hours?
> 2. Anything new in Google Search Console (impressions / new rich result types / new warnings) since the Phase 7 deploys?
> 3. Any merchant-side ops issue that's blocking?
>
> Once we know we're stable, I'll pick the next item. The handoff doc Section 6 has the ranked options.

---

## Closing note

Phase 7 was a clean session. Four PRs in three days, every one of them passed Vercel preview + RRT verification before merge, every one of them had a written audit pre-checked against Google's docs. The two rejected proposals were rejected on the merits, not on effort. The single biggest carry-forward risk is the 46 unbackfilled legacy rows — addressing that would multiply Phase 7's reach. Everything else is housekeeping or a passive wait on Search Console.

Don't lose the audit-first discipline. It worked.
