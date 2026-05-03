-- PR #12: add `negotiable` column to shop_items.
--
-- Background: every Bufaisal listing has been implicitly negotiable. We
-- now want to expose a per-item toggle so workers (and admins) can mark
-- items where the price is at the floor — those items get a grey
-- "Starting Price" pill on the storefront instead of the yellow
-- "Negotiable" pill, and a slightly different WhatsApp prefill.
--
-- Default = TRUE so the new column matches existing behaviour for every
-- legacy row. The migration is idempotent: re-running it after the
-- column already exists is a no-op.
--
-- Run order: deploy this migration BEFORE shipping the PR #12 code.
-- Customer-facing pages read `negotiable` directly; the API allow-lists
-- include it; without the column the inserts fail.

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS negotiable BOOLEAN NOT NULL DEFAULT TRUE;

-- Belt-and-suspenders backfill in case the column existed previously
-- with a permissive default and some historical rows ended up NULL.
-- The NOT NULL constraint above already prevents this on a fresh run,
-- but the UPDATE is harmless and keeps the migration self-healing.
UPDATE shop_items
SET negotiable = TRUE
WHERE negotiable IS NULL;
