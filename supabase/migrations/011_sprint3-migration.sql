-- Sprint 3: Jurf CLEAN & SHIP tab needs clean_photo_url column
-- Run in Supabase Dashboard > SQL Editor (one-time)
ALTER TABLE appliance_items ADD COLUMN IF NOT EXISTS clean_photo_url TEXT;
