-- 024_split-categories.sql
-- Category restructure (2026-06-22): split 2 categories into 4.
--
-- Like the 023 rename, the category string is BOTH the canonical filter value
-- (published_category) AND the AI's output value, so the DB is migrated BEFORE
-- the frontend + locked AI prompt are switched over, or category pages return
-- zero rows. Both the canonical `published_category` and the legacy `category`
-- column carry this taxonomy, so both are migrated (same as 023). All rows,
-- not just status='published'. Run as a single transaction.
--
-- Splits:
--   Living Room  -> Sofas & Seating        (ALL items, no subtype split)
--   Bedroom      -> Beds & Mattresses       (bed frames, mattresses, headboards)
--                -> Wardrobes & Storage      (wardrobes, cupboards)
--                -> Bedroom Furniture        (everything else: nightstands,
--                                             bedside tables, dressers, chests
--                                             of drawers, dressing tables, etc.)
--
-- The Bedroom 3-way split is name-based. It classifies on the resolved display
-- name COALESCE(published_item_name, item_name) so legacy rows (NULL
-- published_item_name) still classify off their legacy item_name. Order within
-- each column matters: Wardrobes is pulled out FIRST, then Beds, then the
-- remainder sweeps into Bedroom Furniture (any Bedroom row still unmatched —
-- including name-less rows — lands here by design).
--
-- Decisions locked 2026-06-22:
--   * "Two-Door Display Cupboard with Glass Panels" -> Wardrobes & Storage
--     (matches the `cupboard` pattern; intentional).
--   * "5-Drawer Storage Cabinet" -> Bedroom Furniture (drawer-based, dresser-
--     like) — `storage cabinet` is deliberately NOT in the Wardrobes pattern.

BEGIN;

-- ============================================================================
-- Living Room -> Sofas & Seating  (all items, both columns)
-- ============================================================================
UPDATE shop_items SET published_category = 'Sofas & Seating' WHERE published_category = 'Living Room';
UPDATE shop_items SET category           = 'Sofas & Seating' WHERE category           = 'Living Room';

-- ============================================================================
-- Bedroom -> 3-way split on COALESCE(published_item_name, item_name)
--   Patterns:
--     Wardrobes & Storage : \y(wardrobe|cupboard)\y
--     Beds & Mattresses   : bed frame | \y(bunk bed|day bed|canopy bed|mattress|headboard)\y
--     Bedroom Furniture   : remainder
-- ============================================================================

-- --- canonical column (published_category) ---------------------------------

-- 1. Wardrobes & Storage (run FIRST so wardrobes/cupboards are pulled out)
UPDATE shop_items SET published_category = 'Wardrobes & Storage'
WHERE published_category = 'Bedroom'
  AND COALESCE(NULLIF(published_item_name, ''), NULLIF(item_name, ''), '') ~* '\y(wardrobe|cupboard)\y';

-- 2. Beds & Mattresses
UPDATE shop_items SET published_category = 'Beds & Mattresses'
WHERE published_category = 'Bedroom'
  AND COALESCE(NULLIF(published_item_name, ''), NULLIF(item_name, ''), '')
      ~* '(bed frame|\y(bunk bed|day bed|canopy bed|mattress|headboard)\y)';

-- 3. Bedroom Furniture (remainder)
UPDATE shop_items SET published_category = 'Bedroom Furniture'
WHERE published_category = 'Bedroom';

-- --- legacy mirror column (category) ---------------------------------------

-- 1. Wardrobes & Storage
UPDATE shop_items SET category = 'Wardrobes & Storage'
WHERE category = 'Bedroom'
  AND COALESCE(NULLIF(published_item_name, ''), NULLIF(item_name, ''), '') ~* '\y(wardrobe|cupboard)\y';

-- 2. Beds & Mattresses
UPDATE shop_items SET category = 'Beds & Mattresses'
WHERE category = 'Bedroom'
  AND COALESCE(NULLIF(published_item_name, ''), NULLIF(item_name, ''), '')
      ~* '(bed frame|\y(bunk bed|day bed|canopy bed|mattress|headboard)\y)';

-- 3. Bedroom Furniture (remainder)
UPDATE shop_items SET category = 'Bedroom Furniture'
WHERE category = 'Bedroom';

COMMIT;

-- Verify after running (PART B verification query — status='published' scope):
--   SELECT published_category, COUNT(*) AS count
--   FROM shop_items
--   WHERE status = 'published'
--   GROUP BY published_category
--   ORDER BY count DESC;
--
-- Expected (status='published' scope):
--   Bedroom Furniture    115
--   Sofas & Seating      107
--   Appliances            62
--   Beds & Mattresses     53
--   Shoe Racks & Shelves  51
--   Office & Fitness      37
--   Wardrobes & Storage   32
--   Dining & Kitchen      28
--   Kids & Baby           16
--   ----  (Living Room and Bedroom should be GONE)  ----
--   TOTAL                501
--
-- Note: the per-statement row counts you see in the SQL editor will be HIGHER
-- than these published-scope numbers, because the migration also touches
-- non-published rows and the legacy `category` column across ALL rows.
