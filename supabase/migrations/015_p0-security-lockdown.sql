-- ============================================================
-- P0 SECURITY LOCKDOWN — April 2026
-- Run in Supabase Dashboard > SQL Editor
--
-- WHAT THIS DOES:
-- 1. Removes the ability for anonymous users to write to shop_items
-- 2. Removes the ability for anonymous users to update website_config
-- 3. Drops the plain text password column from shop_passwords
--
-- All writes now go through server-side API routes using service_role.
-- Anonymous users can only READ published items and READ website config.
-- ============================================================

-- ============================
-- 1. LOCK DOWN shop_items
-- ============================

-- Drop the dangerous anon write policies
DROP POLICY IF EXISTS "anon_insert_shop_items" ON shop_items;
DROP POLICY IF EXISTS "anon_update_shop_items" ON shop_items;
DROP POLICY IF EXISTS "anon_delete_shop_items" ON shop_items;

-- Keep the read policy (public can see published items)
-- "anon_read_published_shop_items" already exists — SELECT only where is_published = true

-- Verify service_role still has full access
-- "service_role_all_shop_items" already exists — no change needed

-- ============================
-- 2. LOCK DOWN website_config
-- ============================

-- Drop the dangerous anon update policy
DROP POLICY IF EXISTS "anon_update_website_config" ON website_config;

-- Keep the read policy (public can read config for the homepage)
-- "anon_read_website_config" already exists — SELECT only

-- Verify service_role still has full access
-- "service_role_all_website_config" already exists — no change needed

-- ============================
-- 3. DROP PLAIN TEXT PASSWORD COLUMN
-- ============================

-- The password_hash column (bcrypt) is now used for all auth.
-- The old 'password' column contains plain text passwords and must be removed.
ALTER TABLE shop_passwords DROP COLUMN IF EXISTS password;

-- ============================
-- 4. VERIFICATION QUERIES
-- Run these AFTER applying the above to confirm lockdown worked.
-- ============================

-- This should SUCCEED (anon can still read published items):
-- SELECT id, item_name FROM shop_items WHERE is_published = true LIMIT 5;

-- This should FAIL with "new row violates row-level security policy":
-- INSERT INTO shop_items (item_name, category) VALUES ('TEST HACK', 'Test');

-- This should FAIL:
-- UPDATE shop_items SET sale_price = 0 WHERE id = 'any-id';

-- This should FAIL:
-- DELETE FROM shop_items WHERE id = 'any-id';

-- This should FAIL:
-- UPDATE website_config SET config_value = 'HACKED' WHERE config_key = 'hero_title';

-- This should show NO 'password' column (only password_hash):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'shop_passwords';
