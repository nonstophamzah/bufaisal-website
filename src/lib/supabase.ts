import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

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
  // v2 columns
  condition: string | null;
  is_featured: boolean;
  is_hidden: boolean;
  seo_title: string | null;
  seo_description: string | null;
  duty_manager: string | null;
  shop_label: string | null;
  condition_notes: string | null;
}

export interface WebsiteConfig {
  id: string;
  config_key: string;
  config_value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DutyManager {
  id: string;
  name: string;
  shop_label: string;
  is_active: boolean;
  created_at: string;
}

export interface ShopPassword {
  id: string;
  shop_label: string;
  password: string;
}
