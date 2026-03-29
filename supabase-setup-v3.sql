-- Bu Faisal - Schema Migration v3
-- Adds condition_notes column to shop_items

ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS condition_notes TEXT;
