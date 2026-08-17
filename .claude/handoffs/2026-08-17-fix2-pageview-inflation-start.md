# 2026-08-17 — Fix 2: pageview inflation, scroll restoration, LCP priority

**Branch:** `main`, clean tree (the untracked `src/scripts/audit-cloudinary-orphans.ts`
is pre-existing and unchanged). **HEAD:** `bb910f5` + this handoff.
All four commits pushed and deployed to production.

## What shipped

| Commit | What |
|---|---|
| `c557ec1` | Removed `html { scroll-behavior: smooth }` — it was silently breaking back-nav scroll restoration |
| `a13631c` | Approach A: `PageViewTracker` keyed on the semantic view; removed the site-wide double-fire |
| `e5a0e41` | `priority` on the first 4 feed cards (LCP) |
| `bb910f5` | Follow-up: dispatch pageviews on analytics-ready, fixing a race `a13631c` introduced |

## The reframe that drove this session

The brief attributed the GA4 inflation to the cumulative `router.replace` refetch.
That was wrong, and it matters for what comes next. There are **two independent
defects**:

- **Defect A (analytics)** — `PageViewTracker` keyed on the `useSearchParams()`
  object, whose identity changes on every navigation. This is what GA4 and Meta
  were counting. **Fixed this session.**
- **Defect B (performance)** — the cumulative refetch, ~6 MB / 5.68s per scroll
  step. Real and expensive, but **completely invisible to GA4**. **Not started.**

Fixing A alone resolves 100% of the measured metric. A third duplicate the brief
didn't account for — the script-level double-fire — was also found and fixed; it
affected **every route**, not just the scroll ones, which is why `/item/*` (2.42)
and `/categories` (3.15) looked like a "baseline" when they were ~1.2 and ~1.6
real loads doubled.

## Stress-test results (all four answered against the code, then measured)

1. **Shuffle stability across appends** — today's cumulative model is stable
   within a Dubai day because the slice is a strict prefix superset. An
   append-based model is **worse**: at midnight rollover it duplicates and skips,
   and — the case the brief didn't raise — **any mid-session pool change**
   (publish / mark sold / hide) shifts offsets and re-serves already-rendered
   rows. Batch uploads are the whole reason `interleaveByCategory` exists, so
   this is routine. **Offset pagination + append is only safe if ordering AND
   pool are frozen.** Today's full-replacement refetch is accidentally providing
   that guarantee — whatever replaces it must provide it explicitly.
2. **Crawler at `?page=3`** — gets items 1–150 cumulatively, but **`?page=N` has
   zero SEO value today**: not in the sitemap, no crawlable link to it, and both
   `/` and `/shop` self-canonicalize. Every item URL is in the sitemap, so item
   discovery never depends on feed depth. Its one real job is **human back-nav
   scroll restoration**.
3. **`history.replaceState`** — does NOT avoid the counted pageview. Next
   intercepts it and syncs `useSearchParams()`. Measured: bare `replaceState`,
   no router → 1 gtag + 1 fbq. This falsified the central claim of the
   hybrid-pagination prior.
4. **Hard refresh at `?page=5`** — yes, 250 items (confirmed live: `?page=3`
   renders exactly 150). Not an edge case: `loadMore` uses `replace`, so Back
   from an item page returns to the last `?page=N`.

## Defect B — B1 SHIPPED (`a0dbbc0`), B2 on the shelf

**Superseded the cursor-first recommendation below after measuring live.** Every
category page is at most 2 pages (largest, Appliances, is 83 items); only the
homepage is deep at 7 pages / 324 items. Cursors solve a problem category feeds
don't have, and the homepage's cost was never pagination — it was `select('*')`
shipping 67 columns when `ItemCard` needs fifteen.

**B1 (shipped):** `FEED_COLUMNS` in `src/lib/feed-query.ts`, 27 columns, one
constant across all four fetch sites. Live: `/` 849 → 307 KB, `/?page=7`
5270 → 1652 KB, category 906 → 339 KB (63–69%). Page-1 output byte-identical
(JSON-LD, item order, head) on 4 URLs; ItemList re-diffed alone at 8983 bytes.
Plus a `console.error` row-cap guard at ≥900 rows.

**B2 (designed, not built) — cursor over a frozen rank window.** Trigger on any
of: visible catalog nears ~800 rows, lean page-7 payload exceeds ~1 MB, or a
category exceeds ~4 pages. Design:
- **RPC required** (PostgREST can't express window functions). Rank with
  `row_number() OVER (PARTITION BY published_category ORDER BY sort_key, id DESC)`
  over the fixed window `created_at <= $t0`, applying visibility as an **output
  filter, not a window predicate**. That is what makes it drift-immune: a
  mid-session publish is outside the window and can't shift ranks; a
  mid-session sale is filtered from output without reclaiming its rank slot.
- **Cursor** `(seed, t0, round, cat_order, id)` — no pinned-seed plumbing, no
  pool cutoff, no client manifest; the cursor carries all of it.
- **Do NOT port `hash01`** (FNV-1a + `Math.imul`) to SQL. The locked decision is
  a deterministic daily-seeded shuffle, not FNV; `md5(seed||':'||id)::bit(32)`
  is equivalent for every property the product relies on, and an exact V8 port
  needs bit-for-bit `& 4294967295` masking that silently reorders the feed if
  wrong.
- **`?page=N` stays** as the SSR + back-nav contract; cursors serve only
  in-session appends.
- **Cutover gate:** a differential test asserting the SQL ordering matches
  `interleaveByCategory` row-for-row over the live catalog.

**Why a naive keyset does NOT work here** (this is the trap): `round` is a
`row_number()`, i.e. a rank, not a row property. An insert with a low sort_key
increments `round` for every later item in that bucket, so a cursor on
`(round, cat_order, id)` re-serves rows; a sale decrements them and skips rows.
Round-robin is irreducibly rank-based — you cannot know an item's round without
counting its bucket. Freezing the *window the rank is computed over* is the fix.

## Original recommendation for Defect B (superseded by B1 above)

The stop condition fired (restoration *was* broken) but **not for the reason
assumed**. My stated premise for flipping B→C was "if restoration is broken, the
cumulative contract is pure cost." Falsified: the contract works — it reconstructs
150 items and the browser restores to the pixel. It was defeated by one cosmetic
CSS line, now removed. So B keeps a mechanism that provably works.

- **B** — delta-fetch via a route handler + `replaceState` + **pinned shuffle
  seed** + `created_at <= t0` **pool cutoff**. ~20 KB flat per step vs
  linearly-growing megabytes. Leaves Q4 (deep `?page=N` SSR) unsolved — same as
  today, so not a regression.
- **C** — frozen ID manifest. Structurally immune to drift, also collapses the
  initial homepage SSR from ~6 MB to ~90 KB, and replaces deep SSR with
  `sessionStorage` restore. Highest blast radius (rewrites the feed data flow
  across four ordering modes). The architecturally correct endgame.

Fold-in for whichever lands: **lean `select()` is load-bearing, not cosmetic** —
`select('*')` pulls 67+ columns including five JSONB blobs (~12.6 KB/row) where
`ItemCard` needs ~15 fields. Third site to include: the `subcatPool` fetch in
`shop-client.tsx`, which downloads the whole category a second time client-side.

## Gotchas for the next session

- **Verify analytics by counting `fbq`/`gtag` calls, not network beacons.** Meta
  uses `sendBeacon` on some pages → invisible to Resource Timing → reads as a
  false zero. This cost real time this session: `/item/*` appeared to have a lost
  PageView when the call was in fact being made.
- **Dev double-counts pageviews** via React StrictMode's effect double-invoke.
  Always verify against a production build.
- **`npm run build` clobbers `.next` out from under a running `next dev`**,
  leaving the dev server 404ing on chunks. Stop dev before building.
- **The build fails on the untracked `src/scripts/audit-cloudinary-orphans.ts`**
  (`prefer-const`). Move it aside to build locally. It is not in git, so CI/Vercel
  is unaffected.
- **The IntersectionObserver does not reliably fire on programmatic
  `window.scrollTo`** in the automation browser. On live it did fire — but with a
  server round-trip delay, so re-poll before concluding it didn't.
- **`?page=N` deep SSR is confirmed real**: `?page=3` → 150 items, 18339px.

## Known unrelated issues found, not fixed

- `src/__tests__/lib/constants.test.ts` asserts `CATEGORIES.length === 8`; there
  have been 11 since the 2026-06-22 split. Stale test, pre-existing, **not** in
  CLAUDE.md's known-failures list (which mentions only the 3 in `gemini.test.ts`).
  Total suite: 4 failed / 87 passed, all pre-existing.
- `/shop?category=X` sets `canonical: '/shop'`, telling Google the category pages
  are duplicates of bare `/shop` — which likely suppresses the ItemList JSON-LD
  shipped in PR #54. Pre-existing, out of scope, worth its own look.

## Read first next session

1. `src/app/shop/shop-client.tsx` — `loadMore`, the sync effect, the observer
2. `src/app/page.tsx` — `getItems`, `interleaveByCategory`, `dailyFeedContext`
3. `src/app/shop/page.tsx` — the parallel `getItems`
4. CLAUDE.md conventions: the two new locked entries (PageViewTracker,
   `scroll-behavior`)
