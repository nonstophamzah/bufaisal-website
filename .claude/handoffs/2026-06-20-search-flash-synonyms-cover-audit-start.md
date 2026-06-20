# Search UX hardening + synonyms + cover-photo audit — handoff (2026-06-20)

## Current branch & state

- Branch `main`, clean. HEAD `385eca4`, all pushed to `origin/main`.
- Every commit below was direct-to-main (no PRs), per Hamzah's standing preference this session.
- Builds verified green throughout (`tsc --noEmit` + `next build`).
- Continues the 2026-06-18 handoff (`8b640e3`); this file covers everything after it.

## Threads completed this session

### 1. Category-redirect: submit-only, no mid-typing clear (`a5c08d2`)
The keyword→category redirect was a per-keystroke `useEffect` that cleared the box mid-typing the instant a whole-term matched. Removed it; redirect now fires ONLY in `handleSearch` (Enter / search button). Live as-you-type keyword search (non-category terms) unchanged.

### 2. The stale-result flash saga (`559d4d5` → `dba0525` → `44bf3ae` → `808ad80` → **`ddaccf0`**)
Symptom: after a same-route search→category redirect, the feed flashed the leftover 1-row keyword result before the SSR category payload loaded. Long debugging arc (logs in `32aedd2`, since removed):
- `559d4d5` clear + `reqId` guard; `dba0525` flushSync; `44bf3ae` prop-sync unconditional; `808ad80` dedicated `useTransition`. **None fully fixed it** — root cause was `flushSync` commits `loading=true` but can't force a browser *paint*, and a fast SSR response replaced it before the frame drew.
- **Final resolution `ddaccf0`:** the category redirect now uses **`window.location.href`** (full-page navigation) instead of `router.push`. `/shop` remounts fresh from SSR, sidestepping ALL same-route client-state timing. Tradeoff (accepted by Hamzah): a full reload on a category-search submit.
- The dead scaffolding (the `isRedirecting` transition, flushSync, all debug logs) was removed in `ddaccf0`.

### 3. Search synonym map (`0b4e183`)
New `src/lib/search-synonyms.ts` → `canonicalizeSearchTerm(raw)`, whole-term match, **query-only** (box + URL `?q` keep the user's original word). Applied at all 3 keyword-query sites: client `buildQuery` (shop-client) + both SSR `getItems` (`/shop` + homepage `page.tsx`).
- **Canonical targets are data-driven** (audited visible published rows): catalog titles use `refrigerator` (5), `washing machine` (9), `sofa` (10), `wardrobe` (17), `tv` (37), `ac` (~20). The "proper" names `air conditioner` and `television` return **0 rows** — so they map to `ac`/`tv`, NOT the other way.
- Map: `fridge/fridges/refrigerators → refrigerator`, `washer/washers → washing machine`, `couch → sofa`, `closet → wardrobe`, `telly/tele/television → tv`, `a/c → ac`, `air conditioner → ac`. (`ac` itself left unmapped — it already matches.)

### 4. Appliances category triggers reduced to category-level only (`bf4ce33` → `290c6dd`)
`src/lib/category-search.ts`: appliances triggers are now just `['appliances','appliance']`. ALL specific-product terms removed so they fall through to keyword search (showing just those products, not the whole 22-item category). `290c6dd` added two synonym backstops (`refrigerators→refrigerator`, `air conditioner→ac`) because those returned 0 via keyword.

### 5. "appliances → 0 results" report + q-free redirect hardening (`385eca4`)
Hamzah reported `"appliances"` showing 0. Audit found the category redirect URL **already** carried only `category`+`redirectedFrom` (no `?q`) — the symptom can only arise on the non-category `writeUrl`/`?q` path, which `"appliances"` doesn't take (it's a trigger). Most likely cause was a **stale deploy**. Hardened anyway: `handleSearch` now `setSearch('')` on the category redirect (guards same-URL no-op edge) and dropped the stale flushSync-era comment. **If "appliances → 0" persists after `385eca4` deploys, it is NOT a code bug in the redirect — re-investigate the deployed SHA first.**

## Cover-photo data issue (AUDIT + Hamzah-run SQL — NO app code change)
- **Root cause:** `worker_photo_brand_url` is a misnomer. Slot 1 of `/team` upload was relabeled "Brand"→"Full Item Photo" on **2026-06-15 18:49 UTC (commit `ffb0f59`)** WITHOUT migrating the column. So rows created **before** that have the brand/label plate in `worker_photo_brand_url` (the public-site cover source via `item-image.ts`), and rows after have the full item.
- Code path is correct for new rows; **do NOT rename the column or slot mapping** (Hamzah: too much ripple for zero gain on new data).
- **Data scope (audited):** 279 published rows before the cutoff; 224 in the brand-plate era (`worker_photo_brand_url` not null); **48 still visible** (the customer-facing set); 55 pre-Phase-3 legacy rows have NULL worker_photo (cover from legacy `image_urls`/`thumbnail_url`).
- Hamzah visually reviewed the 48 (via a generated `/tmp/bufaisal-cover-audit.html`, since deleted) and confirmed `worker_photo_2_url` holds the usable full-item photo for the old rows.
- **Fix applied by Hamzah in Supabase SQL editor** (he runs SQL himself): `UPDATE shop_items SET thumbnail_url = worker_photo_2_url, image_urls[1] = worker_photo_2_url WHERE created_at < '2026-06-15 18:49:00+00' AND worker_photo_brand_url IS NOT NULL AND worker_photo_2_url IS NOT NULL AND status='published';` (NOTE: `image_urls[1]` — Postgres arrays are 1-indexed; original ask said `[0]`). He confirmed it ran.

## Subtleties / gotchas carried forward
- **`window.location.href` for the category redirect is intentional** — don't "optimize" it back to `router.push`; that reintroduces the same-route paint-timing flash that 5 prior commits failed to fix.
- **Synonym canonical targets are inverted from intuition on purpose** — `air conditioner`/`television` map TO `ac`/`tv` because the catalog has 0 rows for the long forms. Verify against the DB before changing.
- **`ac` keyword is noisy** — `%ac%` substring-matches "rack"/"back"/"surface" in descriptions (~229 hits vs ~20 real AC titles). Pre-existing trait of the broad `ilike` `.or(...)`; tightening it (word-boundary / title-only) is a separate task if wanted.
- **Navbar search** (`src/components/Navbar.tsx`) still uses `router.push` for its category redirect (not `window.location.href`). It wasn't in scope; if a same-route flash ever appears via the Navbar while on `/shop`, align it to the full-nav approach.
- **Two unsolved-by-design items from the back-nav work** (still open from prior handoff): scroll-restoration timing under `force-dynamic`, and deep-`?page=N` payload size. Need real-browser verification with >50 visible rows (prod currently has ~48 visible, under one page of 50 — pagination rarely triggers).
- **Live (unsubmitted) search isn't restored on back-nav** — accepted minor gap.

## Files to read first next session
1. `src/app/shop/shop-client.tsx` — handleSearch (category redirect via window.location.href), buildQuery (synonym), prop-sync + loadMore (URL-driven feed), live-search effect.
2. `src/lib/search-synonyms.ts` — synonym map + rationale.
3. `src/lib/category-search.ts` — category triggers (appliances now category-level only).
4. `src/app/shop/page.tsx` + `src/app/page.tsx` — SSR `getItems(category, q, page)` (synonym applied; `?page=N` depth).

## Suggested next steps (no committed direction)
- Verify on a real deploy: "appliances" → 22, "fridge" → refrigerators only, "tv" → TVs only, back-button scroll restoration with >50 rows.
- Optional: align Navbar category redirect to `window.location.href` for consistency.
- Optional: tighten the noisy `ac` keyword match.
- Carry-over SEO item (older handoffs): backfill the 46 legacy rows lacking `published_product_schema`.
