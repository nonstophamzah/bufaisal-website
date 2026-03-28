-- Bu Faisal Shop Items Table
CREATE TABLE IF NOT EXISTS shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT,
  item_name TEXT NOT NULL,
  brand TEXT,
  product_type TEXT,
  description TEXT,
  category TEXT NOT NULL,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  shop_source TEXT,
  image_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  is_sold BOOLEAN DEFAULT FALSE,
  uploaded_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  whatsapp_clicks INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shop_items_category ON shop_items(category);
CREATE INDEX IF NOT EXISTS idx_shop_items_is_published ON shop_items(is_published);
CREATE INDEX IF NOT EXISTS idx_shop_items_is_sold ON shop_items(is_sold);
CREATE INDEX IF NOT EXISTS idx_shop_items_created_at ON shop_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_items_shop_source ON shop_items(shop_source);

-- Enable RLS
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;

-- Public can read published items
CREATE POLICY "Public can view published items"
  ON shop_items FOR SELECT
  USING (is_published = TRUE);

-- Allow inserts for all (team uploads)
CREATE POLICY "Anyone can insert items"
  ON shop_items FOR INSERT
  WITH CHECK (TRUE);

-- Allow updates for all (admin actions)
CREATE POLICY "Anyone can update items"
  ON shop_items FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- Allow deletes for all (admin actions)
CREATE POLICY "Anyone can delete items"
  ON shop_items FOR DELETE
  USING (TRUE);

-- RPC: Increment WhatsApp clicks
CREATE OR REPLACE FUNCTION increment_whatsapp_clicks(item_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shop_items
  SET whatsapp_clicks = whatsapp_clicks + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Increment view count
CREATE OR REPLACE FUNCTION increment_views(item_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shop_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shop_items_updated_at
  BEFORE UPDATE ON shop_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
