-- Migration: Add missing columns for appliance workflow
-- Run this in Supabase SQL Editor BEFORE deploying the code changes
--
-- New status values for location_status:
--   in_repair, repaired, sent_to_shop, denied
-- (added to existing: at_shop, sent_to_jurf, at_jurf, delivered, scrapped)

ALTER TABLE appliance_items
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS date_claimed timestamptz,
  ADD COLUMN IF NOT EXISTS date_repaired timestamptz,
  ADD COLUMN IF NOT EXISTS date_sent_to_shop timestamptz,
  ADD COLUMN IF NOT EXISTS date_accepted_at_shop timestamptz;
