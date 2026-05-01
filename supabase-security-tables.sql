-- =====================================================================
-- Security dashboard tables. Run after supabase-security-lockdown.sql.
-- =====================================================================

-- 1) security_events: signal-only — failed logins, rate-limit hits,
-- origin rejects, new admin IPs, successful logins, admin actions.
CREATE TABLE IF NOT EXISTS security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  ip          TEXT,
  user_name   TEXT,
  route       TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON security_events (event_type, created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON security_events;
CREATE POLICY "service_role only" ON security_events
  FOR ALL USING (auth.role() = 'service_role');

-- 2) api_request_log: errors and slow requests only
-- (logged when status >= 400 OR duration_ms > 2000).
CREATE TABLE IF NOT EXISTS api_request_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route         TEXT NOT NULL,
  method        TEXT NOT NULL,
  status_code   INT NOT NULL,
  ip            TEXT,
  user_name     TEXT,
  duration_ms   INT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_request_log_created_at
  ON api_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_status_created
  ON api_request_log (status_code, created_at DESC);

ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON api_request_log;
CREATE POLICY "service_role only" ON api_request_log
  FOR ALL USING (auth.role() = 'service_role');

-- 3) admin_ip_history: bounded — one row per (user, ip), ever.
CREATE TABLE IF NOT EXISTS admin_ip_history (
  user_name   TEXT NOT NULL,
  ip          TEXT NOT NULL,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_name, ip)
);
CREATE INDEX IF NOT EXISTS idx_admin_ip_history_last_seen
  ON admin_ip_history (last_seen DESC);

ALTER TABLE admin_ip_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON admin_ip_history;
CREATE POLICY "service_role only" ON admin_ip_history
  FOR ALL USING (auth.role() = 'service_role');

-- 4) record_admin_ip RPC. Returns true if (user, ip) is novel
-- (never seen, OR not seen in the last 30 days).
CREATE OR REPLACE FUNCTION record_admin_ip(p_user TEXT, p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  prev_last TIMESTAMPTZ;
BEGIN
  IF p_user IS NULL OR p_ip IS NULL OR p_user = '' OR p_ip = '' OR p_ip = 'unknown' THEN
    RETURN FALSE;
  END IF;

  SELECT last_seen INTO prev_last
    FROM admin_ip_history
   WHERE user_name = p_user AND ip = p_ip;

  INSERT INTO admin_ip_history (user_name, ip)
    VALUES (p_user, p_ip)
    ON CONFLICT (user_name, ip) DO UPDATE SET last_seen = NOW();

  RETURN prev_last IS NULL OR prev_last < NOW() - INTERVAL '30 days';
END;
$$;
