-- HOTFIX: Fix RLS SELECT policy on shop_items
-- The old policy only allowed reading published items,
-- which blocked the admin panel from seeing pending/hidden/sold items.
-- Public pages already filter by is_published=true in their queries.

DROP POLICY IF EXISTS "Public can view published items" ON shop_items;

CREATE POLICY "Anyone can view items"
  ON shop_items FOR SELECT
  USING (TRUE);
