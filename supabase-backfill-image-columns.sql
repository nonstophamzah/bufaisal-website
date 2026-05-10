-- Backfill legacy image columns from Phase 1B worker_photo_*_url canonicals.
--
-- Context: 2026-05-09 broken-thumbnail bug. Root cause was Vercel's image
-- optimizer hitting its Hobby-tier 402 quota — fixed by switching to a
-- custom Cloudinary loader (src/lib/cloudinary-loader.ts). The data layer
-- was healthy, but this is a defensive cleanup to keep the legacy columns
-- in sync with the canonical worker_* columns so future code paths that
-- still read thumbnail_url / image_urls don't render blanks if the legacy
-- mirror was ever wiped or never populated.
--
-- Run order (safe — every statement is idempotent):
--   1. Inspect what would change (rows-to-update count + sample)
--   2. Backfill thumbnail_url where empty
--   3. Backfill image_urls where empty
--   4. Verify (counts should be zero)
--
-- Run in Supabase SQL Editor. Do NOT run blindly — execute step 1 first
-- to confirm the volume looks reasonable.

-- ─────────────────────────────────────────────────────────────────────
-- 1. INSPECT: how many rows would each step touch?
-- ─────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) FILTER (
    WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
      AND worker_photo_brand_url IS NOT NULL
  ) AS would_backfill_thumbnail_url,
  COUNT(*) FILTER (
    WHERE (image_urls IS NULL OR cardinality(image_urls) = 0)
      AND worker_photo_brand_url IS NOT NULL
  ) AS would_backfill_image_urls,
  COUNT(*) FILTER (
    WHERE worker_photo_brand_url IS NULL
      AND (thumbnail_url IS NULL OR thumbnail_url = '')
  ) AS legacy_with_no_canonical_source
FROM shop_items;

-- Optional: peek at 5 affected rows so you can spot-check before mutating.
SELECT id, status, worker_submitted_at,
       thumbnail_url, image_urls, worker_photo_brand_url
FROM shop_items
WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
  AND worker_photo_brand_url IS NOT NULL
ORDER BY worker_submitted_at DESC NULLS LAST
LIMIT 5;

-- ─────────────────────────────────────────────────────────────────────
-- 2. BACKFILL thumbnail_url from worker_photo_brand_url where empty.
-- ─────────────────────────────────────────────────────────────────────

UPDATE shop_items
SET thumbnail_url = worker_photo_brand_url
WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
  AND worker_photo_brand_url IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. BACKFILL image_urls from the worker_photo_*_url trio where empty.
--    Uses the same 3-element layout /api/team/items writes at submit
--    (brand, photo_2, photo_3 — barcode photo is excluded by design).
--    array_remove(..., NULL) drops any NULL slots so we never store
--    {NULL, NULL, NULL} or {url, NULL, url}.
-- ─────────────────────────────────────────────────────────────────────

UPDATE shop_items
SET image_urls = array_remove(
  ARRAY[worker_photo_brand_url, worker_photo_2_url, worker_photo_3_url],
  NULL
)
WHERE (image_urls IS NULL OR cardinality(image_urls) = 0)
  AND worker_photo_brand_url IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 4. VERIFY: re-run the inspect query. Both backfill counts should be 0.
--    Any non-zero value in legacy_with_no_canonical_source is a row that
--    truly has no photo (very old legacy data) — leave it alone; the
--    public site will show /og-image.png via the fallback helper.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) FILTER (
    WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
      AND worker_photo_brand_url IS NOT NULL
  ) AS still_missing_thumbnail_url,
  COUNT(*) FILTER (
    WHERE (image_urls IS NULL OR cardinality(image_urls) = 0)
      AND worker_photo_brand_url IS NOT NULL
  ) AS still_missing_image_urls
FROM shop_items;
