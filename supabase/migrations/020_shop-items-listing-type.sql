-- Migration 020: add `listing_type` to shop_items.
--
-- Captures the worker's explicit "Used" or "New" selection at /team upload.
-- Drives the AI prompt's title prefix ("Used X" vs "New X") so the generated
-- listing matches reality instead of the historical hardcoded "Used".
--
-- Nullable on purpose. Every existing row gets NULL and is NOT touched —
-- this migration is purely additive (IF NOT EXISTS, no DEFAULT, no UPDATE).
-- The 46 in-flight pending_review rows stay byte-identical.
--
-- Run order: deploy this migration BEFORE shipping the listing-type PR.
-- The /api/team/items route will start rejecting inserts where the field is
-- missing once the new code is live, so the column must exist first.
--
-- Forward compatibility:
-- * The AI prompt falls back to "Used" when listing_type IS NULL, so legacy
--   rows continue to regenerate identically.
-- * Phase 2 backlog: the existing `condition` field has 'Brand New' as one
--   of its 4 values (used by Made-by-Bu-Faisal items). With listing_type
--   now landing, there is semantic overlap. Decide later whether to
--   deprecate 'Brand New' from condition once listing_type is fully adopted.

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS listing_type TEXT
  CHECK (listing_type IS NULL OR listing_type IN ('used', 'new'));

-- DO NOT add an UPDATE here. Backfilling would modify existing rows and
-- violate the byte-identical constraint on the 46 pending_review items.

-- Verification queries (run manually after applying):
--
--   -- Should return: listing_type | text | YES
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'shop_items' AND column_name = 'listing_type';
--
--   -- Should return 0 — proves no existing row was modified.
--   SELECT COUNT(*) FROM shop_items WHERE listing_type IS NOT NULL;
--
--   -- Should fail with a CHECK violation — proves the constraint is live.
--   INSERT INTO shop_items (item_name, category, sale_price, listing_type)
--   VALUES ('test', 'Test', 1, 'refurbished');
