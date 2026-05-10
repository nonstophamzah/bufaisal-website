-- Backfill published_* columns for rows approved through legacy /admin
--
-- Context: 2026-05-10. The legacy admin-approve flow at
-- /api/admin/items (action='approve' / 'bulk_approve') only sets
-- is_published=true + the legacy approved_by/approved_at scalar
-- columns. It never computed the Phase 1B published_* columns and
-- never wrote to audit_log. Two production rows ended up status=
-- 'published' with all 12 published_* NULL — the public site fell
-- back to the legacy item_name/description/etc. columns and looked
-- correct, masking the bug until we queried the data directly.
--
-- The /admin/pending sidecar fix (PR coming with this file) removes
-- the legacy Pending tab from the nav so future approvals can only
-- happen through Phase 5's flow, which DOES populate published_*.
-- This SQL backfills the two rows already broken.
--
-- Backfill rule (from spec §5C, mirrors src/lib/admin-pending-publish.ts):
--   published_X = COALESCE(admin_X, ai_X)            for each editable field
--   published_at = COALESCE(admin_approved_at, approved_at, NOW())
-- Plus the legacy mirror columns the public site reads, so the row
-- displays the AI-generated content instead of whatever the legacy
-- admin edit had typed (or left blank).
--
-- Run order (idempotent — safe to re-run):
--   1. INSPECT what would change.
--   2. BACKFILL the rows.
--   3. VERIFY (count of broken rows should be 0 after).
--
-- Run in Supabase SQL Editor. Step 1 first.

-- ─────────────────────────────────────────────────────────────────────
-- 1. INSPECT — find the affected rows.
-- ─────────────────────────────────────────────────────────────────────
-- Criteria: status='published', published_at IS NULL, ai_* populated.
-- (published_at IS NULL is the cleanest single-column signal — it's
--  written exclusively by the Phase 5 publish path, never by legacy.)

SELECT id,
       status,
       is_published,
       approved_at,
       admin_approved_at,
       published_at,
       (ai_description IS NOT NULL) AS ai_populated,
       (published_description IS NOT NULL) AS published_already_set
FROM shop_items
WHERE status = 'published'
  AND published_at IS NULL
  AND ai_description IS NOT NULL  -- only rows that have AI output to copy from
ORDER BY approved_at DESC NULLS LAST;

-- ─────────────────────────────────────────────────────────────────────
-- 2. BACKFILL — populate published_* + legacy mirror columns.
--    Uses COALESCE(admin_X, ai_X) for each field per spec §5C.
--    Worker columns drive condition / price / negotiable per the
--    "worker wins for condition" locked rule.
-- ─────────────────────────────────────────────────────────────────────

UPDATE shop_items
SET
  -- Phase 1B published_* columns (the 12 that actually exist in the
  -- migration — see src/lib/admin-pending-publish.ts for the full list).
  published_brand            = COALESCE(admin_brand,            ai_brand),
  published_item_name        = COALESCE(admin_item_name,        ai_item_name),
  published_product_type     = COALESCE(admin_product_type,     ai_product_type),
  published_category         = COALESCE(admin_category,         ai_category),
  published_seo_title        = COALESCE(admin_seo_title,        ai_seo_title),
  published_meta_description = COALESCE(admin_meta_description, ai_meta_description),
  published_description      = COALESCE(admin_description,      ai_description),
  published_spec_table       = COALESCE(admin_spec_table,       ai_spec_table),
  published_faqs             = COALESCE(admin_faqs,             ai_faqs),
  published_trust_signals    = COALESCE(admin_trust_signals,    ai_trust_signals),
  published_slug             = COALESCE(admin_slug,             ai_slug),
  published_at               = COALESCE(admin_approved_at, approved_at, NOW()),

  -- Phase 5 admin audit columns. If admin_approved_at is missing,
  -- backfill from the legacy approved_at so we have a Phase-5-shaped
  -- record. approved_by stays as it is.
  admin_approved_at          = COALESCE(admin_approved_at, approved_at, NOW()),
  admin_approved_by          = COALESCE(admin_approved_by, approved_by, 'backfill'),

  -- Phase 6 bridge — legacy columns the public site reads.
  -- Mirror the computed published values into the legacy text columns
  -- so the public site renders the AI-generated content. Doesn't
  -- overwrite a manually-edited legacy column unless it's empty/null.
  item_name        = COALESCE(NULLIF(item_name, ''),        admin_item_name,        ai_item_name, ''),
  brand            = COALESCE(NULLIF(brand, ''),            admin_brand,            ai_brand),
  category         = COALESCE(NULLIF(category, ''),         admin_category,         ai_category, ''),
  description      = COALESCE(NULLIF(description, ''),      admin_description,      ai_description),
  seo_title        = COALESCE(NULLIF(seo_title, ''),        admin_seo_title,        ai_seo_title),
  seo_description  = COALESCE(NULLIF(seo_description, ''),  admin_meta_description, ai_meta_description),
  product_type     = COALESCE(NULLIF(product_type, ''),     admin_product_type,     ai_product_type),
  sale_price       = COALESCE(sale_price,                   admin_price_aed,        worker_price_aed),
  negotiable       = COALESCE(negotiable,                   admin_negotiable,       worker_negotiable),
  condition        = COALESCE(NULLIF(condition, ''),        admin_condition_grade,  worker_condition_grade),
  barcode          = COALESCE(NULLIF(barcode, ''),          ai_barcode_extracted)
WHERE status = 'published'
  AND published_at IS NULL
  AND ai_description IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. VERIFY — should return 0 rows.
-- ─────────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS rows_still_missing_published_columns
FROM shop_items
WHERE status = 'published'
  AND published_at IS NULL
  AND ai_description IS NOT NULL;

-- Spot-check the backfilled rows:
SELECT id,
       status,
       LEFT(published_description, 60)      AS published_description_preview,
       LEFT(published_seo_title, 60)        AS published_seo_title_preview,
       admin_approved_at,
       admin_approved_by,
       published_at
FROM shop_items
WHERE id IN (
  '45e82440-ed11-4009-8fc9-791da99065ce',
  '01ff3138-63a7-4267-b782-0a41c0330022'
);
