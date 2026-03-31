-- Add approval_status column to appliance_items
ALTER TABLE appliance_items ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_appliance_items_approval ON appliance_items(approval_status);

-- Update any existing items to 'approved' so they aren't stuck
UPDATE appliance_items SET approval_status = 'approved' WHERE approval_status IS NULL;
