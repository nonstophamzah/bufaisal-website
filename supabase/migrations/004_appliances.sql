-- ============================================================
-- Bu Faisal Appliance Operations Tracker
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- Appliance items table
CREATE TABLE IF NOT EXISTS appliance_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL,
  item_name TEXT,
  product_type TEXT,
  brand TEXT,
  problem TEXT,
  status TEXT DEFAULT 'Not Working',
  party TEXT DEFAULT 'Take My Junk',
  shop_source TEXT,
  needs_jurf BOOLEAN DEFAULT false,
  date_received DATE,
  month TEXT,
  date_sent_to_jurf DATE,
  date_received_jurf DATE,
  tested_by TEXT,
  repair_problem TEXT,
  repair_status TEXT,
  cleaned BOOLEAN,
  repair_cost DECIMAL,
  date_ready_to_sell DATE,
  destination_shop TEXT,
  new_barcode TEXT,
  sale_price DECIMAL,
  customer_complaint TEXT,
  return_status TEXT,
  return_notes TEXT,
  brand_photo TEXT,
  item_photo TEXT,
  barcode_photo TEXT,
  repair_photos TEXT[],
  security_photos TEXT[],
  before_cleaning_photo TEXT,
  after_cleaning_outside_photo TEXT,
  after_cleaning_inside_photo TEXT,
  delivery_photo TEXT,
  truck_plate TEXT,
  delivery_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appliance_barcode ON appliance_items(barcode);
CREATE INDEX IF NOT EXISTS idx_appliance_status ON appliance_items(status);
CREATE INDEX IF NOT EXISTS idx_appliance_needs_jurf ON appliance_items(needs_jurf);
CREATE INDEX IF NOT EXISTS idx_appliance_created_at ON appliance_items(created_at DESC);

-- RLS
ALTER TABLE appliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_items" ON appliance_items FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can insert appliance_items" ON appliance_items FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Anyone can update appliance_items" ON appliance_items FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Anyone can delete appliance_items" ON appliance_items FOR DELETE USING (TRUE);

-- Workers table
CREATE TABLE IF NOT EXISTS appliance_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appliance_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_workers" ON appliance_workers FOR SELECT USING (TRUE);

INSERT INTO appliance_workers (name, pin, role) VALUES
  ('Imran', '1111', 'shop'),
  ('Mustafa', '2222', 'jurf'),
  ('Nawaz', '3333', 'jurf'),
  ('Foysal', '4444', 'jurf'),
  ('Faruk', '9999', 'delivery'),
  ('Cleaner', '1212', 'cleaning'),
  ('Security A', '8181', 'security'),
  ('Security B', '8282', 'security'),
  ('Security C', '8383', 'security'),
  ('Security D', '8484', 'security'),
  ('Security E', '8585', 'security'),
  ('Humaan', '3333', 'manager'),
  ('Admin', '0000', 'manager')
ON CONFLICT DO NOTHING;

-- Violations table
CREATE TABLE IF NOT EXISTS appliance_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_name TEXT NOT NULL,
  description TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appliance_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_violations" ON appliance_violations FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can insert appliance_violations" ON appliance_violations FOR INSERT WITH CHECK (TRUE);

-- Audit log table
CREATE TABLE IF NOT EXISTS appliance_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT,
  action TEXT,
  item_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appliance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read appliance_audit_log" ON appliance_audit_log FOR SELECT USING (TRUE);
CREATE POLICY "Anyone can insert appliance_audit_log" ON appliance_audit_log FOR INSERT WITH CHECK (TRUE);

-- Auto-update updated_at trigger for appliance_items
CREATE OR REPLACE FUNCTION update_appliance_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appliance_items_updated_at ON appliance_items;
CREATE TRIGGER appliance_items_updated_at
  BEFORE UPDATE ON appliance_items
  FOR EACH ROW
  EXECUTE FUNCTION update_appliance_items_updated_at();
