-- ═══════════════════════════════════════════════════════════════════
-- BU FAISAL — CARPENTER TRACKER
-- Run in Supabase Dashboard > SQL Editor
--
-- Internal-only schema. RLS is enabled with NO policies, which means
-- only service_role (used by /api/carpenter-tracker via supabaseAdmin)
-- can read or write. The anon key cannot touch these tables.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Workers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carpenter_workers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  shop        TEXT NOT NULL,                 -- 'A'|'B'|'C'|'D'|'E'
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpenter_workers ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

INSERT INTO carpenter_workers (name, shop) VALUES
  ('Nur Nabi', 'A'),
  ('Sohail',   'A'),
  ('Jahangir', 'B'),
  ('Ujjal',    'C'),
  ('Zahir BD', 'D'),
  ('Suleman',  'E')
ON CONFLICT DO NOTHING;

-- ── 2. Rates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carpenter_rates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type   TEXT UNIQUE NOT NULL,
  rate_aed    INTEGER NOT NULL,
  active      BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpenter_rates ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- Auto-bump updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_carpenter_rates_ts()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS carpenter_rates_ts ON carpenter_rates;
CREATE TRIGGER carpenter_rates_ts BEFORE UPDATE ON carpenter_rates
  FOR EACH ROW EXECUTE FUNCTION update_carpenter_rates_ts();

INSERT INTO carpenter_rates (item_type, rate_aed) VALUES
  ('Cupboard 01 Door', 5),
  ('Cupboard 02 Door', 5),
  ('Cupboard 03 Door', 7),
  ('Cupboard 04 Door', 10),
  ('Cupboard 05 Door', 10),
  ('Cupboard 06 Door', 10),
  ('Cupboard Sliding', 10),
  ('Drawer',           3),
  ('Dresser',          3),
  ('TV Stand',         7),
  ('Table',            3),
  ('Chair',            3),
  ('Fan Assembling',   3),
  ('Shelf',            3),
  ('Single Bed',       3),
  ('Double Bed',       5),
  ('Shoe Rack',        3),
  ('Bunk Bed',         7)
ON CONFLICT (item_type) DO NOTHING;

-- ── 3. Items ───────────────────────────────────────────────────────
-- worker_id is a real FK (NOT a name string — deliberate departure
-- from appliance_items which links by created_by TEXT).
-- worker_name is a denormalized snapshot at log time, so renaming a
-- worker later does NOT rewrite history.
-- rate_at_log is the snapshot rate; never recompute from carpenter_rates.
CREATE TABLE IF NOT EXISTS carpenter_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id         UUID NOT NULL REFERENCES carpenter_workers(id),
  worker_name       TEXT NOT NULL,
  shop              TEXT NOT NULL,
  item_type         TEXT NOT NULL,
  rate_at_log       INTEGER NOT NULL,
  before_photo_url  TEXT NOT NULL,
  after_photo_url   TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carpenter_items_worker  ON carpenter_items(worker_id);
CREATE INDEX IF NOT EXISTS idx_carpenter_items_shop    ON carpenter_items(shop);
CREATE INDEX IF NOT EXISTS idx_carpenter_items_created ON carpenter_items(created_at DESC);

ALTER TABLE carpenter_items ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- ── 4. Config (entry + manager codes) ──────────────────────────────
-- Same shape as appliance_config. API supports bcrypt OR plaintext
-- (plaintext for now, migrate to bcrypt later — matches appliance pattern).
CREATE TABLE IF NOT EXISTS carpenter_config (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpenter_config ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

INSERT INTO carpenter_config (key, value) VALUES
  ('entry_code',   '0000'),
  ('manager_code', '0000')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════
SELECT 'workers' AS table, COUNT(*) FROM carpenter_workers
UNION ALL SELECT 'rates',   COUNT(*) FROM carpenter_rates
UNION ALL SELECT 'items',   COUNT(*) FROM carpenter_items
UNION ALL SELECT 'config',  COUNT(*) FROM carpenter_config;
