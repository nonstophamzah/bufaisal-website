-- =====================================================================
-- 022 — Add sold_channel to shop_items
-- =====================================================================
--
-- Tracks how a sold item left the building: online (marketplace /
-- WhatsApp) vs in the physical shop. Drives the channel badge on the
-- admin Sold tab and unlocks online-vs-shop sales reporting later.
--
--   sold_channel  TEXT, nullable, expected values 'online' | 'shop'
--
-- Nullable on purpose: every pre-existing sold row predates this column
-- and stays NULL (unknown channel). New sales set it at mark-sold time.
-- The CHECK constraint keeps the column to the two known values (or NULL)
-- so a typo'd write can never land a junk channel.
-- =====================================================================

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS sold_channel TEXT;

ALTER TABLE shop_items
  DROP CONSTRAINT IF EXISTS shop_items_sold_channel_check;

ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_sold_channel_check
  CHECK (sold_channel IS NULL OR sold_channel IN ('online', 'shop'));
