-- ============================================================
-- APPLIANCE RLS LOCKDOWN
-- Removes dangerous anon write access on appliance tables.
-- After this, all writes MUST go through API routes (supabaseAdmin).
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ── appliance_items: drop all anon write policies ──
DROP POLICY IF EXISTS "Anyone can insert appliance_items" ON appliance_items;
DROP POLICY IF EXISTS "Anyone can update appliance_items" ON appliance_items;
DROP POLICY IF EXISTS "Anyone can delete appliance_items" ON appliance_items;

-- Keep read-only for anon (needed by client-side queries)
-- If "Anyone can read appliance_items" doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appliance_items' AND policyname = 'Anon can read appliance_items'
  ) THEN
    EXECUTE 'CREATE POLICY "Anon can read appliance_items" ON appliance_items FOR SELECT USING (TRUE)';
  END IF;
END $$;

-- Drop old read policy if it has a different name, then rename
DROP POLICY IF EXISTS "Anyone can read appliance_items" ON appliance_items;

-- Recreate clean read-only policy
DROP POLICY IF EXISTS "Anon can read appliance_items" ON appliance_items;
CREATE POLICY "Anon can read appliance_items" ON appliance_items FOR SELECT USING (TRUE);


-- ── appliance_config: drop anon update policy ──
DROP POLICY IF EXISTS "Anyone can update appliance_config" ON appliance_config;
DROP POLICY IF EXISTS "Anyone can insert appliance_config" ON appliance_config;
DROP POLICY IF EXISTS "Anyone can delete appliance_config" ON appliance_config;

-- Keep read-only for anon (needed for entry/manager code validation)
DROP POLICY IF EXISTS "Anyone can read appliance_config" ON appliance_config;
CREATE POLICY "Anon can read appliance_config" ON appliance_config FOR SELECT USING (TRUE);


-- ── appliance_workers: lock down similarly ──
DROP POLICY IF EXISTS "Anyone can insert appliance_workers" ON appliance_workers;
DROP POLICY IF EXISTS "Anyone can update appliance_workers" ON appliance_workers;
DROP POLICY IF EXISTS "Anyone can delete appliance_workers" ON appliance_workers;

-- Keep read-only
DROP POLICY IF EXISTS "Anyone can read appliance_workers" ON appliance_workers;
DROP POLICY IF EXISTS "Anon can read appliance_workers" ON appliance_workers;
CREATE POLICY "Anon can read appliance_workers" ON appliance_workers FOR SELECT USING (TRUE);


-- ── appliance_audit_log: anon should not read or write ──
DROP POLICY IF EXISTS "Anyone can insert appliance_audit_log" ON appliance_audit_log;
DROP POLICY IF EXISTS "Anyone can read appliance_audit_log" ON appliance_audit_log;
DROP POLICY IF EXISTS "Anyone can update appliance_audit_log" ON appliance_audit_log;
DROP POLICY IF EXISTS "Anyone can delete appliance_audit_log" ON appliance_audit_log;

-- No anon access at all — only service_role reads/writes audit logs


-- ── Verify: list remaining policies ──
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('appliance_items', 'appliance_config', 'appliance_workers', 'appliance_audit_log')
ORDER BY tablename, policyname;
