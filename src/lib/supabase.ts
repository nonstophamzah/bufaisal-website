import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ShopItem {
  id: string;
  barcode: string | null;
  item_name: string;
  brand: string | null;
  product_type: string | null;
  description: string | null;
  category: string;
  sale_price: number;
  shop_source: string | null;
  image_urls: string[];
  thumbnail_url: string | null;
  is_published: boolean;
  is_sold: boolean;
  uploaded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  whatsapp_clicks: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}
