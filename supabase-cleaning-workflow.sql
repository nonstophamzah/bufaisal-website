-- ═════════════════════════════════════════════════════════════════
-- CLEANING WORKFLOW MIGRATION
-- Adds mandatory cleaning gate between Jurf repair and shop delivery.
-- After an item is repaired, a cleaner must capture 4 before + 4 after
-- photos (inside/outside/front/back) before the item can be sent to
-- a shop. Jurf repair workers cannot SEND an item until cleaning_status
-- = 'cleaned'.
-- ═════════════════════════════════════════════════════════════════

-- Step 1: Add columns
ALTER TABLE appliance_items
  ADD COLUMN IF NOT EXISTS cleaning_status TEXT,
  ADD COLUMN IF NOT EXISTS cleaned_by TEXT,
  ADD COLUMN IF NOT EXISTS date_cleaning_claimed TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_cleaned TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS before_cleaning_photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_cleaning_photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cleaning_flagged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cleaning_flag_note TEXT,
  ADD COLUMN IF NOT EXISTS cleaning_flagged_at TIMESTAMPTZ;

-- Step 2: Backfill — any item currently in location_status='repaired'
-- needs to be marked as awaiting cleaning so it shows up in the queue.
-- We do NOT auto-mark these as already cleaned, because no cleaning
-- evidence exists for legacy items. Managers can review.
UPDATE appliance_items
  SET cleaning_status = 'pending'
  WHERE location_status = 'repaired'
    AND cleaning_status IS NULL;

-- Items already sent to shops or delivered get marked 'legacy_skipped'
-- so analytics can distinguish them from items that went through the
-- cleaning gate properly.
UPDATE appliance_items
  SET cleaning_status = 'legacy_skipped'
  WHERE location_status IN ('sent_to_shop', 'delivered', 'at_shop')
    AND condition = 'repaired'
    AND cleaning_status IS NULL;

-- Step 3: Indexes for cleaning queue queries
CREATE INDEX IF NOT EXISTS idx_appliance_cleaning_status ON appliance_items(cleaning_status);
CREATE INDEX IF NOT EXISTS idx_appliance_cleaned_by ON appliance_items(cleaned_by);
CREATE INDEX IF NOT EXISTS idx_appliance_cleaning_flagged ON appliance_items(cleaning_flagged) WHERE cleaning_flagged = TRUE;

-- Step 4: Verification
SELECT cleaning_status, COUNT(*)
FROM appliance_items
GROUP BY cleaning_status
ORDER BY cleaning_status NULLS LAST;

-- ═════════════════════════════════════════════════════════════════
-- STATE MACHINE AFTER THIS MIGRATION
-- ═════════════════════════════════════════════════════════════════
--
-- cleaning_status values:
--   NULL            — item never needed cleaning (e.g. working items
--                     shipped directly from shop without going to Jurf)
--   'pending'       — repaired, waiting for cleaner to claim
--   'in_cleaning'   — claimed by a cleaner, photos being captured
--   'cleaned'       — 4 before + 4 after photos uploaded; ready to ship
--   'legacy_skipped'— existed before this migration; no evidence photos
--
-- Gating rules (enforced in application code, not DB constraint yet):
--   Jurf SEND tab only lists items where cleaning_status='cleaned'
--     OR cleaning_status='legacy_skipped' (for backfill tolerance).
--   Cleaners can only claim items with cleaning_status='pending'.
--   Alert-manager sets cleaning_flagged=TRUE without changing status.
-- ═════════════════════════════════════════════════════════════════
