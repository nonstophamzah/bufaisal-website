-- ============================================================
-- Bu Faisal - SECURITY LOCKDOWN
-- Run in Supabase Dashboard > SQL Editor
-- Drops ALL existing RLS policies, creates restrictive ones.
-- ============================================================

-- ============================
-- 1. ENABLE RLS ON ALL TABLES
-- ============================
ALTER TABLE IF EXISTS shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS website_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS duty_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appliance_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appliance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appliance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appliance_config ENABLE ROW LEVEL SECURITY;

-- ============================
-- 2. DROP ALL EXISTING POLICIES
-- ============================

-- shop_items
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'shop_items') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON shop_items', r.policyname);
  END LOOP;
END $$;

-- website_config
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'website_config') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON website_config', r.policyname);
  END LOOP;
END $$;

-- shop_passwords
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'shop_passwords') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON shop_passwords', r.policyname);
  END LOOP;
END $$;

-- duty_managers
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'duty_managers') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON duty_managers', r.policyname);
  END LOOP;
END $$;

-- appliance_items
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'appliance_items') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appliance_items', r.policyname);
  END LOOP;
END $$;

-- appliance_workers
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'appliance_workers') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appliance_workers', r.policyname);
  END LOOP;
END $$;

-- appliance_violations
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'appliance_violations') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appliance_violations', r.policyname);
  END LOOP;
END $$;

-- appliance_audit_log
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'appliance_audit_log') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appliance_audit_log', r.policyname);
  END LOOP;
END $$;

-- appliance_config
DO $$ BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'appliance_config') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON appliance_config', r.policyname);
  END LOOP;
END $$;

-- ============================
-- 3. CREATE RESTRICTIVE POLICIES
-- ============================

-- shop_items: public read is restricted to published items only
CREATE POLICY "anon_read_published_shop_items"
  ON shop_items FOR SELECT
  TO anon
  USING (is_published = true);

-- shop_items: anon can insert (team upload page), update, delete (admin page)
-- Admin page uses anon key for CRUD — no user auth system exists yet
CREATE POLICY "anon_insert_shop_items"
  ON shop_items FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_shop_items"
  ON shop_items FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_delete_shop_items"
  ON shop_items FOR DELETE
  TO anon
  USING (true);

-- shop_items: service_role can do everything
CREATE POLICY "service_role_all_shop_items"
  ON shop_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- website_config: public can read and update (admin settings page uses anon key)
CREATE POLICY "anon_read_website_config"
  ON website_config FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_update_website_config"
  ON website_config FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- website_config: service_role full access
CREATE POLICY "service_role_all_website_config"
  ON website_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- shop_passwords: NO public access at all — only via RPC or service_role
CREATE POLICY "service_role_all_shop_passwords"
  ON shop_passwords FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- duty_managers: NO public access
CREATE POLICY "service_role_all_duty_managers"
  ON duty_managers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appliance_items: NO public access
CREATE POLICY "service_role_all_appliance_items"
  ON appliance_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appliance_workers: NO public access
CREATE POLICY "service_role_all_appliance_workers"
  ON appliance_workers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appliance_violations: NO public access
CREATE POLICY "service_role_all_appliance_violations"
  ON appliance_violations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appliance_audit_log: NO public access
CREATE POLICY "service_role_all_appliance_audit_log"
  ON appliance_audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appliance_config: NO public access
CREATE POLICY "service_role_all_appliance_config"
  ON appliance_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================
-- 4. UPDATE check_shop_password RPC to use bcrypt
-- ============================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION check_shop_password(p_shop_label TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT password_hash INTO stored_hash
  FROM shop_passwords
  WHERE shop_label = p_shop_label;

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN stored_hash = crypt(p_password, stored_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- 5. Migrate shop_passwords to use hashed passwords
-- ============================
-- Add password_hash column if not exists
ALTER TABLE shop_passwords ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Hash existing plain-text passwords (only if password_hash is not yet set)
UPDATE shop_passwords
SET password_hash = crypt(password, gen_salt('bf'))
WHERE password_hash IS NULL AND password IS NOT NULL;

-- NOTE: After verifying hashes work, drop the plain 'password' column:
-- ALTER TABLE shop_passwords DROP COLUMN password;

-- ============================
-- 6. VERIFICATION QUERY (run after applying)
-- ============================
-- This should return 0 rows when run with anon key:
-- SELECT * FROM shop_passwords;
-- This should fail:
-- SELECT * FROM duty_managers;
-- SELECT * FROM appliance_items;
