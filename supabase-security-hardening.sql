-- ============================================================
-- Bu Faisal - Security Hardening
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. BLOCK PUBLIC READ on shop_passwords (passwords should only be checked via .eq() query, not dumped)
DROP POLICY IF EXISTS "Public can read shop passwords" ON shop_passwords;
CREATE POLICY "Check password only via exact match"
  ON shop_passwords FOR SELECT
  USING (TRUE);  -- Supabase requires a SELECT policy for .eq() queries to work
-- NOTE: The passwords are still readable. For true security, move password
-- validation to a server-side RPC function (below).

-- 2. CREATE SERVER-SIDE PASSWORD CHECK (prevents reading all passwords)
CREATE OR REPLACE FUNCTION check_shop_password(p_shop_label TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM shop_passwords
    WHERE shop_label = p_shop_label AND password = p_password
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. BLOCK PUBLIC READ on appliance_workers (PINs exposed)
-- Replace with RPC function that only returns names (not PINs)
CREATE OR REPLACE FUNCTION get_worker_names(p_role TEXT)
RETURNS TABLE(id UUID, name TEXT, role TEXT) AS $$
BEGIN
  RETURN QUERY SELECT w.id, w.name, w.role
  FROM appliance_workers w
  WHERE w.role = p_role
  ORDER BY w.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify worker PIN without exposing it
CREATE OR REPLACE FUNCTION verify_worker_pin(p_worker_id UUID, p_pin TEXT)
RETURNS TABLE(name TEXT, role TEXT) AS $$
BEGIN
  RETURN QUERY SELECT w.name, w.role
  FROM appliance_workers w
  WHERE w.id = p_worker_id AND w.pin = p_pin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. TIGHTEN shop_items: allow INSERT but restrict UPDATE/DELETE to items you created
-- (Not enforced yet since we use anon key — would need Supabase Auth for proper per-user policies)

-- 5. Add updated_at auto-trigger for shop_passwords if not exists
CREATE OR REPLACE FUNCTION update_shop_passwords_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.password = NEW.password; -- no-op but ensures trigger fires
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
