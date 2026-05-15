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
  // Agent-workflow status. NULL on legacy items.
  // Phase 3 (Decisions Log v1.1 Addendum): new submissions land in
  // 'processing' (AI hasn't run) and Phase 4's background job moves them
  // to 'pending'. Admin approve sets status='published' (added 2026-05-09
  // to stop the legacy approve flow from clobbering 'pending' rows back
  // to NULL — full Phase 5 admin rewrite still pending).
  // 'agent_drafting' stays in the union for any in-flight legacy rows
  // still being processed by the old kickoff path.
  status: 'processing' | 'pending' | 'published' | 'agent_drafting' | 'sent_back' | null;
  // PR #12: per-item negotiable flag. true = "Negotiable" pill (default),
  // false = "Starting Price" pill (price is at the floor).
  negotiable: boolean;
  // Worker's explicit Used/New choice from /team upload. Drives the AI
  // prompt's title prefix. NULL on legacy rows — prompt falls back to "Used".
  listing_type: 'used' | 'new' | null;
  // Phase 1B canonical shop identifier (BF1–BF5). Used by the SEO Agent
  // prompt and by Phase 6.4 PR B for shop GBP links + similar-items
  // shop-tier query. NULL on pre-Phase-3 legacy rows.
  worker_shop_id: string | null;
  // Phase 1B worker_*_url canonical photo columns. Always set on Phase
  // 3+ rows. Used as a fallback by `getItemImageUrl()` when the legacy
  // image_urls / thumbnail_url columns are empty. NULL on pre-Phase-3
  // legacy rows.
  worker_photo_brand_url: string | null;
  worker_photo_2_url: string | null;
  worker_photo_3_url: string | null;
  worker_photo_barcode_url: string | null;
  // Phase 1B negotiable layer. Read via `admin_negotiable ?? worker_negotiable`;
  // the legacy `negotiable` mirror retires in Phase 6.5. NULL on
  // pre-Phase-3 legacy rows.
  worker_negotiable: boolean | null;
  admin_negotiable: boolean | null;
  // Phase 1B condition layer.
  // `worker_condition_type` ('Used' | 'New') captures the new-vs-used
  // signal that the legacy `condition` column encoded as 'Brand New'.
  // No admin override column exists today — known gap; if admin needs
  // to flip type at approve time, a future migration adds
  // `admin_condition_type` and the public-side read pattern becomes
  // `admin_condition_type ?? worker_condition_type`.
  // `worker_condition_grade` carries the Used-only grade and is paired
  // with `admin_condition_grade` via the standard admin?? worker rule;
  // the legacy `condition` mirror retires in Phase 6.5.
  worker_condition_type: 'Used' | 'New' | null;
  worker_condition_grade: 'Excellent' | 'Good' | 'Fair' | null;
  admin_condition_grade: 'Excellent' | 'Good' | 'Fair' | null;
  // Phase 1B price + negotiable layer. Read via the effective-fields
  // helpers: `getEffectivePrice()` chains `admin_price_aed ??
  // worker_price_aed ?? sale_price`, and the public-side negotiable
  // pill reads `admin_negotiable ?? worker_negotiable`. NULL on
  // pre-Phase-3 legacy rows; sale_price stays as the final fallback.
  worker_price_aed: number | null;
  admin_price_aed: number | null;
  // Phase 1B AI barcode extraction. Public-display canonical source;
  // the legacy `barcode` mirror retires in Phase 6.5. NULL when the AI
  // couldn't read the barcode photo or for pre-Phase-3 rows.
  ai_barcode_extracted: string | null;
  // Phase 6.3 — public-text published_* columns consumed by
  // `resolvePublicItemFields()` to prefer the publish-time snapshot over
  // the legacy mirror. JSONB / layout-only published_* columns are added
  // in Phase 6.4. NULL on pre-Phase-5 legacy rows.
  published_item_name: string | null;
  published_brand: string | null;
  published_category: string | null;
  published_product_type: string | null;
  published_description: string | null;
  published_seo_title: string | null;
  published_meta_description: string | null;
  // Phase 6.4 — JSONB layout/schema columns also consumed via
  // `resolvePublicItemFields()`. No legacy mirror counterparts exist.
  // NULL on pre-Phase-5 rows.
  published_product_schema: Record<string, unknown> | null;
  published_faq_schema: Record<string, unknown> | null;
  published_spec_table: Record<string, string> | null;
  published_faqs: Array<{ question: string; answer: string }> | null;
  published_trust_signals: string[] | null;
  // Phase 1B / 6.4 PR B — per-photo alt text array, aligned positionally
  // with the four worker_photo_* columns. NULL on pre-Phase-5 rows.
  published_image_alt_texts: string[] | null;
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
