-- v2 Migration: add slug, negotiable, status columns to shop_items
-- Backfills status from existing booleans, then archives all rows.
-- Old boolean columns (is_published, is_sold, is_featured, is_hidden) are NOT dropped here.

-- =====================
-- FORWARD MIGRATION
-- =====================

BEGIN;

-- 1. Add slug column (nullable for now; backfilled below before adding unique constraint)
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS slug text;

-- 2. Add negotiable column (default true, not null)
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS negotiable boolean NOT NULL DEFAULT true;

-- 3. Add status column with CHECK constraint
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_status_check;
ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_status_check
  CHECK (status IN ('draft', 'published', 'sold', 'archived'));

-- 4. Backfill status from existing booleans (precedence: sold > draft (hidden/unpublished) > published)
UPDATE shop_items
SET status = CASE
  WHEN is_sold = true THEN 'sold'
  WHEN is_hidden = true OR is_published = false THEN 'draft'
  WHEN is_published = true AND is_sold = false AND is_hidden = false THEN 'published'
  ELSE 'draft'
END;

-- Then archive every row (per business decision: all current inventory is stale).
UPDATE shop_items SET status = 'archived';

-- 5. Backfill slug for archived rows.
-- Pattern: lowercased item_name, non-alphanumerics → hyphen, collapse repeated hyphens, trim, append last 8 chars of id.
UPDATE shop_items
SET slug = COALESCE(
  NULLIF(
    trim(both '-' from regexp_replace(regexp_replace(lower(item_name), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')),
    ''
  ),
  'item'
) || '-' || right(id::text, 8)
WHERE slug IS NULL;

-- 6. Now enforce unique + indexed slug
CREATE UNIQUE INDEX IF NOT EXISTS shop_items_slug_unique_idx ON shop_items(slug);

-- 7. Composite index on (status, category) for query performance
CREATE INDEX IF NOT EXISTS shop_items_status_category_idx ON shop_items(status, category);

COMMIT;

-- =====================
-- VERIFICATION QUERIES
-- =====================
-- SELECT status, COUNT(*) FROM shop_items GROUP BY status;
-- SELECT COUNT(*) FROM shop_items WHERE slug IS NULL;
-- SELECT COUNT(*) FROM shop_items WHERE negotiable IS NULL;

-- =====================
-- ROLLBACK (manual; run only if you need to revert)
-- =====================
-- BEGIN;
-- DROP INDEX IF EXISTS shop_items_status_category_idx;
-- DROP INDEX IF EXISTS shop_items_slug_unique_idx;
-- ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_status_check;
-- ALTER TABLE shop_items DROP COLUMN IF EXISTS status;
-- ALTER TABLE shop_items DROP COLUMN IF EXISTS negotiable;
-- ALTER TABLE shop_items DROP COLUMN IF EXISTS slug;
-- COMMIT;
