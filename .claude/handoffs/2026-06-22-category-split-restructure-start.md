# Category restructure: 8 → 11 categories (split) — handoff (2026-06-22)

## Current branch & state

- Branch `main`. HEAD `d5a3614`. **6 commits ahead of `origin/main` — NOT yet pushed.** (Push when ready to deploy.)
- All six commits below were direct-to-main (no PRs), per Hamzah's standing preference.
- DB migration 024 already **run in production** by Hamzah; verification pass is green (10/10 checks).
- This is a distinct effort from the earlier 2026-06-22 work (sort-priority + 023 rename + subtabs, HEAD `6150386`) recorded in CLAUDE.md's "Session Log — 2026-06-22". This session **split** two of those categories into four.

## What was built today — all shipped to main

Six commits:

- **`fe318e3`** — `constants.ts` rebuilt with **11 categories**, new slugs, transitive **2-hop** `resolveCategorySlug` (with cycle guard). Old `Bedroom` and `Living Room` removed. **Everyday Essentials** added as a real category (its obsolete `everyday-essentials → shoe-racks-shelves` alias removed so the slug resolves to itself). New lucide icons imported: `Shirt` (Wardrobes & Storage), `Lamp` (Bedroom Furniture), `Home` (Everyday Essentials).
- **`5f11928`** — Subcategory tabs (`SUBCATEGORY_FILTERS`) and sort priority (`PRIORITY_RULES`) updated for the 4 new furniture categories. Old Bedroom/Living Room configs removed. `CATEGORY_INTROS` old keys swapped.
- **`de6602d`** — AI prompt (`lib/prompts/listing-generator-v1.md`) JOB 3 decision tree replaced with a **12-step** tree covering all 11 categories (Shoe Racks & Shelves now a specific shoe/shelf bucket; **Everyday Essentials is the step-12 default catch-all**). PRODUCT_TYPE_VOCABULARY updated. `category-search.ts` triggers updated with new slugs + bare-word redirects (`living room → sofas-seating`, `bedroom → bedroom-furniture`); dedicated `everyday-essentials` entry.
- **`15cb827`** — Prompt furniture-conditional sections (carpenter assembly, condition FAQ, trust signals) updated to reference the 4 new category names instead of `Living Room, Bedroom`.
- **`29f2111`** — `everyday-essentials` intro added to `CATEGORY_INTROS` (now all 11 slugs have intros). Cosmetic prompt example label fixed (`Used Bedroom` → `Used Bedroom Furniture`).
- **`d5a3614`** — Migration `024_split-categories.sql` committed to version control.

## DB migration 024 — complete (run in prod)

- `Living Room` (107 rows) → **Sofas & Seating**
- `Bedroom` (200 rows) → split: **Bedroom Furniture** (115), **Beds & Mattresses** (53), **Wardrobes & Storage** (32)
- Both `published_category` AND legacy `category` columns migrated across **all** rows (same approach as migration 023).
- Bedroom 3-way split is **name-based** on `COALESCE(published_item_name, item_name)`; Wardrobes pulled out first, then Beds, remainder → Bedroom Furniture. See `supabase/migrations/024_split-categories.sql` header for the locked edge-case decisions (Display Cupboard → Wardrobes; 5-Drawer Storage Cabinet → Bedroom Furniture).
- **Do NOT re-run.** Idempotency note: re-running is a no-op only because `Living Room`/`Bedroom` no longer exist as source values — there is no rollback in the file.

## The 11 locked categories (final)

`Sofas & Seating`, `Beds & Mattresses`, `Wardrobes & Storage`, `Bedroom Furniture`, `Dining & Kitchen`, `Appliances`, `Office & Fitness`, `Kids & Baby`, `Outdoor & Garden`, `Shoe Racks & Shelves`, `Everyday Essentials`.

Verified consistent across all 5 category-aware files (constants, category-sort, shop-client subtabs+intros, category-search, prompt) + the `/admin/pending` category dropdown (which auto-reads `CATEGORIES`). Production published-row counts (501 total, no Bedroom/Living Room): Bedroom Furniture 115, Sofas & Seating 107, Appliances 62, Beds & Mattresses 53, Shoe Racks & Shelves 51, Office & Fitness 37, Wardrobes & Storage 32, Dining & Kitchen 28, Kids & Baby 16. (Outdoor & Garden + Everyday Essentials = 0 published rows.)

## Subtleties / gotchas carried forward

- **`Everyday Essentials` has 0 published rows** — the migration maps nothing into it; it fills only as new AI items hit the step-12 default. Its category page is empty today (no empty-state copy — silent).
- **`Outdoor & Garden` also has 0 published rows** (pre-existing, not caused by this work).
- **Transitive alias chains are load-bearing:** `bedroom-sleep → bedroom → bedroom-furniture` and `living-room-lounge → living-room → sofas-seating` rely on `resolveCategorySlug` following up to **2 hops**. Do not revert it to a single lookup, and do not modify/remove existing aliases (it breaks pre-2026-06-21 indexed links).
- **New-category hero images are PLACEHOLDERS** — Wardrobes & Storage and Bedroom Furniture reuse the Bedroom Unsplash photo (flagged in `constants.ts` comments). Swap for dedicated images when available.
- **Cosmetic leftovers (intentionally untouched):** prompt line ~293 example body still describes an "IKEA MALM queen bed frame" under the "Used Bedroom Furniture" label (that item is really Beds & Mattresses) — label-only fix was requested. Admin `/admin/pending/[id]/page.tsx` `PRODUCT_TYPES` list (SACRED) still has `// Bedroom`/`// Living Room` section comments + `Bedroom Set`/`Living Room Set` product_type values — separate from categories, still functional.
- **CLAUDE.md "Last session handoff" pointer was NOT updated this session** — per the documented convention it should point here; left for Hamzah to confirm (scope was the handoff file only).

## Files to read first next session

1. `src/lib/constants.ts` — `CATEGORIES` (11), `CATEGORY_SLUG_ALIASES`, `resolveCategorySlug` (2-hop).
2. `src/lib/category-sort.ts` — `PRIORITY_RULES` (6 prioritized categories).
3. `src/app/shop/shop-client.tsx` — `SUBCATEGORY_FILTERS` (4) + `CATEGORY_INTROS` (11).
4. `src/lib/category-search.ts` — triggers + new slugs + bare-word redirects.
5. `lib/prompts/listing-generator-v1.md` — JOB 3 (12-step tree) + PRODUCT_TYPE_VOCABULARY + furniture-conditional sections.
6. `supabase/migrations/024_split-categories.sql` — the migration + locked edge-case decisions.

## Next priorities (in order)

1. **Card components cleanup** — audit/fix any product card components still referencing old category names or slugs (`Living Room`, `Bedroom`, `living-room`, `bedroom`). Grep all `.ts`/`.tsx` under `src/`; fix hardcoded references found. (This session's sweep found none in the 5 core files, but a dedicated card-component pass wasn't the focus.)
2. **Homepage feed rebalancing** — category-balanced mix instead of newest-first (batch uploads currently flood one category). Research Noon / Amazon / Home Centre / Home Box / Danube homepage structure FIRST. Options: round-robin by category, weighted random, featured-first then newest.
3. **Related categories strip** — "You might also like" horizontal strip on every category page linking to adjacent categories. Static config, no DB changes.

## DO NOT TOUCH without explicit instruction

- **Sacred routes:** `/team`, `/admin`, `/appliances`, `/api/appliances`.
- **The 11-category structure** — no additions or renames without full debate.
- **Migration 024** — already run, do not re-run.
- **The slug alias chain** — do not modify existing aliases.

## How to start next session

Paste this handoff doc. Run this query first:

```sql
SELECT published_category, COUNT(*) AS total, MAX(created_at) AS latest_upload
FROM shop_items
WHERE status = 'published'
GROUP BY published_category
ORDER BY total DESC;
```

**Data first, decisions second, code last.**
