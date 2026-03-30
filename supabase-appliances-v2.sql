-- ============================================================
-- Bu Faisal Appliance Tracker v2
-- Run in Supabase Dashboard > SQL Editor
-- Drop old tables first if you want a clean start:
--   DROP TABLE IF EXISTS appliance_audit_log, appliance_violations, appliance_items, appliance_workers CASCADE;
-- ============================================================

-- Config table
CREATE TABLE IF NOT EXISTS appliance_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE appliance_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_config" ON appliance_config FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can update appliance_config" ON appliance_config FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

INSERT INTO appliance_config (key, value) VALUES ('entry_code', '123abc')
ON CONFLICT (key) DO NOTHING;

-- Items table
CREATE TABLE IF NOT EXISTS appliance_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_type TEXT,
  brand TEXT,
  status TEXT DEFAULT 'Not Working',
  problems TEXT[] DEFAULT '{}',
  shop TEXT,
  photo_url TEXT,
  needs_jurf BOOLEAN DEFAULT false,
  date_received DATE,
  date_sent_to_jurf DATE,
  tested_by TEXT,
  repair_notes TEXT,
  repair_cost DECIMAL,
  destination_shop TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appliance_items_barcode ON appliance_items(barcode);
CREATE INDEX IF NOT EXISTS idx_appliance_items_status ON appliance_items(status);
CREATE INDEX IF NOT EXISTS idx_appliance_items_shop ON appliance_items(shop);
CREATE INDEX IF NOT EXISTS idx_appliance_items_created ON appliance_items(created_at DESC);

ALTER TABLE appliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_items" ON appliance_items FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can insert appliance_items" ON appliance_items FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Anyone can update appliance_items" ON appliance_items FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_appliance_items_ts()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS appliance_items_ts ON appliance_items;
CREATE TRIGGER appliance_items_ts BEFORE UPDATE ON appliance_items FOR EACH ROW EXECUTE FUNCTION update_appliance_items_ts();

-- Workers table
CREATE TABLE IF NOT EXISTS appliance_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  tab TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE appliance_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_workers" ON appliance_workers FOR SELECT USING (TRUE);

-- Seed workers (skip if already exists)
INSERT INTO appliance_workers (name, role, tab) VALUES
  ('Imran', 'shop', 'SHOP'),
  ('Foysal', 'jurf', 'JURF'),
  ('Nawaz', 'jurf', 'JURF'),
  ('Mustafa', 'jurf', 'JURF'),
  ('Cleaner', 'cleaning', 'JURF'),
  ('Faruk', 'delivery', 'JURF'),
  ('Security A', 'security', 'SECURITY'),
  ('Security B', 'security', 'SECURITY'),
  ('Security C', 'security', 'SECURITY'),
  ('Security D', 'security', 'SECURITY'),
  ('Security E', 'security', 'SECURITY'),
  ('Humaan', 'manager', 'MANAGER'),
  ('Admin', 'manager', 'MANAGER')
ON CONFLICT DO NOTHING;
