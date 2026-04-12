-- ============================================================
-- PHASE 1: Add condition + location_status columns
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- Step 1: Add new columns
ALTER TABLE appliance_items
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'not_working',
ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'at_shop';

-- Step 2: Migrate existing data — condition column
UPDATE appliance_items SET condition = 'working' WHERE status = 'Working';
UPDATE appliance_items SET condition = 'not_working' WHERE status = 'Not Working';
UPDATE appliance_items SET condition = 'pending_scrap' WHERE status = 'Pending Scrap';
UPDATE appliance_items SET condition = 'scrap' WHERE status = 'Scrap';
UPDATE appliance_items SET condition = 'repaired' WHERE status = 'Repaired';

-- Step 3: Migrate existing data — location_status column
UPDATE appliance_items SET location_status = 'sent_to_jurf'
  WHERE date_sent_to_jurf IS NOT NULL AND date_received_jurf IS NULL;
UPDATE appliance_items SET location_status = 'at_jurf'
  WHERE date_received_jurf IS NOT NULL;
UPDATE appliance_items SET location_status = 'at_shop'
  WHERE date_sent_to_jurf IS NULL;
-- Also handle items with status = 'sent_to_jurf' from prior code
UPDATE appliance_items SET location_status = 'sent_to_jurf'
  WHERE status = 'sent_to_jurf' AND location_status = 'at_shop';
UPDATE appliance_items SET location_status = 'at_jurf'
  WHERE status = 'at_jurf' AND location_status = 'at_shop';
UPDATE appliance_items SET location_status = 'delivered'
  WHERE status = 'Delivered';

-- Step 4: Add indexes
CREATE INDEX IF NOT EXISTS idx_appliance_location_status ON appliance_items(location_status);
CREATE INDEX IF NOT EXISTS idx_appliance_condition ON appliance_items(condition);

-- Step 5: Verify migration
SELECT condition, location_status, COUNT(*)
FROM appliance_items
GROUP BY condition, location_status
ORDER BY condition, location_status;

-- ============================================================
-- COLUMN REFERENCE
-- ============================================================
-- condition: describes item physical state
--   'working'        → Item works
--   'not_working'    → Item broken
--   'pending_scrap'  → Awaiting scrap approval
--   'scrap'          → Scrapped
--   'repaired'       → Fixed at Jurf
--
-- location_status: describes where item is in the pipeline
--   'at_shop'        → At shop, not yet sent
--   'sent_to_jurf'   → In transit to Jurf
--   'at_jurf'        → At Jurf, confirmed received
--   'repaired'       → Repair complete, ready for next step
--   'ready_to_sell'  → Ready to sell
--   'delivered'      → Delivered to destination
--   'sold'           → Sold
--   'scrapped'       → Scrapped/disposed
--
-- DO NOT drop old 'status' column yet — keep until confirmed working
