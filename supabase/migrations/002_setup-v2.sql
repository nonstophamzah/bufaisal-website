-- ============================================================
-- Bu Faisal - Schema Migration v2
-- Run this AFTER supabase-setup.sql (v1) has been applied.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- ============================================================
-- TASK 1: Add new columns to shop_items
-- ============================================================

ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'Good';
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS duty_manager TEXT;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS shop_label TEXT;

-- Index on featured items (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_shop_items_is_featured ON shop_items(is_featured);
CREATE INDEX IF NOT EXISTS idx_shop_items_is_hidden ON shop_items(is_hidden);
CREATE INDEX IF NOT EXISTS idx_shop_items_shop_label ON shop_items(shop_label);

-- ============================================================
-- TASK 2: website_config table
-- ============================================================

CREATE TABLE IF NOT EXISTS website_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- Auto-update updated_at on website_config
CREATE OR REPLACE FUNCTION update_website_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS website_config_updated_at ON website_config;
CREATE TRIGGER website_config_updated_at
  BEFORE UPDATE ON website_config
  FOR EACH ROW
  EXECUTE FUNCTION update_website_config_updated_at();

-- Insert default rows (skip if key already exists)
INSERT INTO website_config (config_key, config_value) VALUES
  ('hero_title', 'UAE''S BIGGEST USED GOODS SOUQ'),
  ('hero_subtitle', 'Quality second-hand furniture & appliances since 2009'),
  ('whatsapp_number', '971585932499'),
  ('about_text', 'Since 2009, Bu Faisal has been Ajman''s trusted destination for quality pre-owned goods. What started as a single shop has grown into the UAE''s biggest used goods souq, operating 5 shops across Ajman. We believe in giving quality items a second life. Every piece in our collection is carefully inspected to ensure it meets our standards before being offered to our customers. By choosing pre-owned goods, our customers save money while contributing to a more sustainable way of living.'),
  ('shop_a_name', 'Shop A'),
  ('shop_b_name', 'Shop B'),
  ('shop_c_name', 'Shop C'),
  ('shop_d_name', 'Shop D'),
  ('shop_e_name', 'Shop E')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- TASK 3: duty_managers table
-- ============================================================

CREATE TABLE IF NOT EXISTS duty_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  shop_label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_managers_shop_label ON duty_managers(shop_label);
CREATE INDEX IF NOT EXISTS idx_duty_managers_is_active ON duty_managers(is_active);

-- ============================================================
-- TASK 4: shop_passwords table
-- ============================================================

CREATE TABLE IF NOT EXISTS shop_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_label TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

-- Insert default passwords (skip if already exists)
INSERT INTO shop_passwords (shop_label, password) VALUES
  ('A', 'bufaisala'),
  ('B', 'bufaisalb'),
  ('C', 'bufaisalc'),
  ('D', 'bufaisald'),
  ('E', 'bufaisale')
ON CONFLICT (shop_label) DO NOTHING;

-- ============================================================
-- TASK 5: RLS policies
-- ============================================================

-- website_config
ALTER TABLE website_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read website config"
  ON website_config FOR SELECT
  USING (TRUE);

CREATE POLICY "Anyone can insert website config"
  ON website_config FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Anyone can update website config"
  ON website_config FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- duty_managers
ALTER TABLE duty_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read duty managers"
  ON duty_managers FOR SELECT
  USING (TRUE);

CREATE POLICY "Anyone can insert duty managers"
  ON duty_managers FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Anyone can update duty managers"
  ON duty_managers FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Anyone can delete duty managers"
  ON duty_managers FOR DELETE
  USING (TRUE);

-- shop_passwords
ALTER TABLE shop_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read shop passwords"
  ON shop_passwords FOR SELECT
  USING (TRUE);

-- ============================================================
-- TASK 6: Confirm increment_views RPC exists
-- (CREATE OR REPLACE is safe — re-creates if exists)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_views(item_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shop_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
