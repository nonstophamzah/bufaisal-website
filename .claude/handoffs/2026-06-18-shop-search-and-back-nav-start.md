# Shop search redirect + back-nav scroll — Next session handoff (2026-06-18)

## Current branch & state

- Branch: `main`, clean, all work pushed to `origin/main`.
- HEAD: `08eea5e`.
- Build verified green at HEAD (`tsc --noEmit` clean, `next build` compiled successfully).
- No PRs opened this session — everything committed directly to `main` at Hamzah's instruction.

## What shipped this session (commit SHAs, oldest → newest)

All changes are on the **public marketplace search/feed surface** (`src/app/shop/shop-client.tsx`, `src/components/Navbar.tsx`, `src/app/shop/page.tsx`, `src/app/page.tsx`, plus a new `src/lib/category-search.ts`). No sacred routes touched.

**Part A — category-name search redirect hardening**

- `376ecec` — Expanded the category-redirect term map with product synonyms (fridge/washer/ac/tv → appliances, sofa/couch → living-room, wardrobe/mattress/bed → bedroom, dining table/set → kitchen, treadmill → office-study-fitness).
- `fe5a65e` — Fixed a race where the keyword search fired before the redirect. Redirect now fires immediately (no debounce); the keyword fetch is suppressed for a category term.
- `a8593d1` — **Extracted `detectCategorySlug` + `CATEGORY_SEARCH_TRIGGERS` into `src/lib/category-search.ts`** (shared, no `'use client'`). Routed the **Navbar** search through it — previously the Navbar pushed straight to `/shop?q=` and bypassed redirect detection entirely (that was the real "redirect doesn't work" bug: users used the header magnifier, not the in-page box).

**Part B — "Showing X for 'term'" redirect label (iterated several times — read the final state, not the intermediate commits)**

- `80cb4ea` → `7895ca2` → `e8611d7` → `edf1ead` → `cd5d4c6` — Hamzah changed his mind twice on how to convey the redirected term. **Final landed behavior (`edf1ead` + `cd5d4c6`):**
  - The matched term rides along as a `redirectedFrom` URL param: `/shop?category=appliances&redirectedFrom=fridge`. It is **display-only — never fed into `buildQuery`/the filter.** SSR (`getItems`) also ignores it.
  - A dismissible pill renders below the category header: *Showing **Appliances** for "fridge"*. Term + category name are read from the **URL** (reactive, correct on same-route nav).
  - The search box **is cleared** on redirect (`setSearch('')` in the redirect effect) so the term lives only in the label and can't act as a residual keyword filter.
  - Label clears on: category tap (`writeUrl` drops the param), using the search box again (local `labelDismissed` on input change), or the X (strips `redirectedFrom` from the URL via `router.replace`).
  - **Do not** revert to "keep the term in the search box" — that was an intermediate decision (`e8611d7`) Hamzah explicitly superseded.

**Part C — back-button / scroll-restoration fix (the headline change, `08eea5e`)**

Fixes: scrolling deep into the feed (or applying filters) then hitting back dumped the user at the top. Root cause: the feed was built by client-side infinite-scroll append into `useState`; on back-nav the component remounted with only SSR page 1, so the document was too short for native scroll restoration to land.

The shop feed is now **URL-driven**:
- `?page=N` tracks depth. SSR `getItems(category, q, page)` returns pages `1..N` in one shot via `.range(0, page * SHOP_PAGE_SIZE - 1)` (inclusive; `SHOP_PAGE_SIZE = 50`). Applied to **both** `src/app/shop/page.tsx` and `src/app/page.tsx` (they share `ShopClient`).
- `loadMore` = `router.replace('?page='+next, { scroll: false })` inside a `useTransition` — bumps depth without polluting history or jumping the viewport.
- Category + search filters switched `router.replace` → `router.push` (each is a back-navigable history entry; omitting `page` resets depth).
- `activeCategory` and `pageNum` are now **read from the URL** (`searchParams`), not `useState`. This also fixed the long-standing same-route `activeCategory` desync as a side effect. `setActiveCategory` was removed entirely.
- A prop-sync effect (`setItems(initialItems)` on `initialItems` change) adopts each SSR payload. The client-append `loadMore` was removed.
- The only remaining client-side fetch is **live as-you-type search** (`fetchItems`), now guarded to fire on a **non-empty** `search` term only. Clearing search / "Show all" navigate (drop `?q`) so the SSR list restores.

CLAUDE.md updated with a "Shop feed is URL-driven (locked 2026-06-18)" convention bullet under Conventions (the `Sparse-render hide thresholds` neighborhood).

## Files the next session must read first

1. `src/app/shop/shop-client.tsx` — the heart of all of the above. State decls (~L93–121), `buildQuery`/`fetchItems` (live search), prop-sync + `loadMore` (~L160–183), live-search effect (~L240), `writeUrl`/`handleCategoryClick` (~L256), redirect effect + label (~L185–222, ~L350).
2. `src/lib/category-search.ts` — shared `detectCategorySlug` + `CATEGORY_SEARCH_TRIGGERS`.
3. `src/app/shop/page.tsx` and `src/app/page.tsx` — the two SSR `getItems(category, q, page)` (identical pattern).
4. `src/components/Navbar.tsx` — `handleSearch` routes through `detectCategorySlug`.

## Subtleties / gotchas carried forward

- **`{ scroll: false }` on `loadMore` is load-bearing.** Without it, bumping `?page` would itself scroll to top — the exact bug we fixed. Keep it.
- **`initialItems` identity is stable between navigations** (the server parent doesn't re-run on client state changes), which is why the prop-sync effect doesn't fight live search. If you ever make the server component re-render on something other than navigation, re-check that effect.
- **Live (unsubmitted) search is not restored on back** — it never enters the URL until `loadMore`/submit. Accepted minor gap; the complaint was about scroll/submitted filters.
- **Two things still need real-browser verification** (couldn't confirm headlessly):
  1. Scroll-restoration **timing** — page is `force-dynamic`, so back-nav re-runs SSR through a Suspense boundary; Next may occasionally restore a beat before the tall content paints. Test the back button with **>50 published items** so pagination actually engages.
  2. **Deep-page payload** — `?page=10` fetches 500 rows in one SSR query. Fine at today's inventory; consider a depth cap if the catalog grows large.
- **Production inventory is ~49 visible rows — under one page of 50** — so infinite scroll / `loadMore` essentially never triggers in production today. The pagination path is built for scale but is hard to exercise on prod right now. Verify locally by temporarily lowering `SHOP_PAGE_SIZE` or seeding rows; never lower it in committed code.
- **`sortBy` is still a no-op** (pre-existing): `buildQuery` never references it; the "Newest/Featured" dropdown changes nothing. Left untouched this session — not in scope. Flag for a future cleanup if sort becomes a real requirement.
- **Five inline JSON-LD sites** still use the simpler `replace(/</g, '\\u003c')` escaping rather than the locked `escapeJsonLd()` helper (`layout.tsx`, `page.tsx`, `shop/page.tsx`, `categories/page.tsx`) — pre-existing, migrate when next touching those files.

## Suggested next steps (no committed direction yet)

- Manually verify back-nav scroll restoration on a deploy with >50 items (see gotchas).
- Optional: cap max `?page` depth in `getItems` if catalog grows.
- Unrelated carry-forwards from prior handoff still open: backfill the 46 legacy rows lacking `published_product_schema` (biggest SEO lift), WhatsApp emoji bug ([#48](https://github.com/nonstophamzah/bufaisal-website/issues/48)).
