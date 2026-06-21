-- 023_rename-categories.sql
-- Category taxonomy rename (2026-06-21).
--
-- Renames 5 of the 8 category labels to shorter / clearer customer-facing
-- names. The category string is the canonical filter value (published_category)
-- AND the AI's output value, so the DB must be migrated BEFORE the frontend +
-- locked AI prompt are switched over, or category pages return zero rows.
--
-- Renames (3 categories unchanged: Appliances, Kids & Baby, Outdoor & Garden):
--   Bedroom & Sleep         -> Bedroom
--   Living Room & Lounge    -> Living Room
--   Kitchen & Dining        -> Dining & Kitchen
--   Office, Study & Fitness -> Office & Fitness
--   Everyday Essentials     -> Shoe Racks & Shelves
--
-- Both the canonical `published_category` and the legacy `category` column carry
-- this taxonomy, so both are migrated. Run as a single transaction.

BEGIN;

-- Canonical column (drives the public-site SSR filter + category-sort).
UPDATE shop_items SET published_category = 'Bedroom'              WHERE published_category = 'Bedroom & Sleep';
UPDATE shop_items SET published_category = 'Living Room'          WHERE published_category = 'Living Room & Lounge';
UPDATE shop_items SET published_category = 'Dining & Kitchen'     WHERE published_category = 'Kitchen & Dining';
UPDATE shop_items SET published_category = 'Office & Fitness'     WHERE published_category = 'Office, Study & Fitness';
UPDATE shop_items SET published_category = 'Shoe Racks & Shelves' WHERE published_category = 'Everyday Essentials';

-- Legacy mirror column (admin reads + resolver fallback for pre-Phase-5 rows).
UPDATE shop_items SET category = 'Bedroom'              WHERE category = 'Bedroom & Sleep';
UPDATE shop_items SET category = 'Living Room'          WHERE category = 'Living Room & Lounge';
UPDATE shop_items SET category = 'Dining & Kitchen'     WHERE category = 'Kitchen & Dining';
UPDATE shop_items SET category = 'Office & Fitness'     WHERE category = 'Office, Study & Fitness';
UPDATE shop_items SET category = 'Shoe Racks & Shelves' WHERE category = 'Everyday Essentials';

COMMIT;

-- Verify after running:
--   SELECT published_category, COUNT(*) FROM shop_items GROUP BY 1 ORDER BY 2 DESC;
-- Expect: Bedroom, Living Room, Dining & Kitchen, Office & Fitness,
--         Shoe Racks & Shelves, Appliances, Kids & Baby, Outdoor & Garden.
