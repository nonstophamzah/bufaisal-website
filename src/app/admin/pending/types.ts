// Phase 5 admin pending dashboard — local item type.
//
// The legacy `ShopItem` interface in `src/lib/supabase.ts` predates the
// Phase 1B schema separation and does not include the worker_*, ai_*,
// admin_*, or published_* columns. Rather than mutating that interface
// (which is consumed by the legacy /admin and /item pages), Phase 5
// declares its own row shape covering only the columns it reads or
// writes. When Phase 6 rewrites the public site to read published_*,
// ShopItem will be retired in favor of types like this one.

export interface PendingItem {
  // ── Identity / state ──
  id: string;
  status: string | null;
  created_at: string | null;

  // ── Worker columns (set at submit) ──
  worker_id: string | null;
  worker_shop_id: string | null;
  worker_condition_type: 'Used' | 'New' | null;
  worker_condition_grade: 'Excellent' | 'Good' | 'Fair' | null;
  worker_negotiable: boolean | null;
  worker_price_aed: number | null;
  worker_note: string | null;
  worker_photo_brand_url: string | null;
  worker_photo_2_url: string | null;
  worker_photo_3_url: string | null;
  worker_photo_barcode_url: string | null;
  worker_submitted_at: string | null;

  // ── AI columns (populated by Phase 4 background job) ──
  ai_barcode_extracted: string | null;
  ai_label_item_type: string | null;
  ai_brand: string | null;
  ai_item_name: string | null;
  ai_product_type: string | null;
  ai_category: string | null;
  ai_seo_title: string | null;
  ai_h1_title: string | null;
  ai_meta_description: string | null;
  ai_slug: string | null;
  ai_description: string | null;
  ai_spec_table: Record<string, unknown> | null;
  ai_faqs: Array<{ question: string; answer: string }> | null;
  ai_image_alt_texts: string[] | null;
  ai_geographic_anchor: string | null;
  ai_trust_signals: string[] | null;
  ai_internal_link_targets: Record<string, unknown> | null;
  ai_product_schema: unknown;
  ai_faq_schema: unknown;
  ai_confidence_score: number | null;
  ai_flags: string[] | null;
  ai_generated_at: string | null;
  ai_prompt_version: string | null;
  ai_model_used: string | null;

  // ── Admin override columns (set only when admin edits during review) ──
  admin_brand: string | null;
  admin_item_name: string | null;
  admin_product_type: string | null;
  admin_category: string | null;
  admin_seo_title: string | null;
  admin_meta_description: string | null;
  admin_description: string | null;
  admin_slug: string | null;
  admin_spec_table: Record<string, unknown> | null;
  admin_faqs: Array<{ question: string; answer: string }> | null;
  admin_trust_signals: string[] | null;
  admin_image_alt_texts: string[] | null;
  admin_geographic_anchor: string | null;
  admin_internal_link_targets: Record<string, unknown> | null;
  admin_condition_grade: 'Excellent' | 'Good' | 'Fair' | null;
  admin_price_aed: number | null;
  admin_negotiable: boolean | null;
  admin_approved_at: string | null;
  admin_approved_by: string | null;
}

// Subset shape sent to PATCH (save edits without approving). Every field
// optional. Fields explicitly set to null clear the override and revert
// to the AI value on the next publish.
export type PendingItemEdits = Partial<{
  admin_brand: string | null;
  admin_item_name: string | null;
  admin_product_type: string | null;
  admin_category: string | null;
  admin_seo_title: string | null;
  admin_meta_description: string | null;
  admin_description: string | null;
  admin_slug: string | null;
  admin_spec_table: Record<string, unknown> | null;
  admin_faqs: Array<{ question: string; answer: string }> | null;
  admin_trust_signals: string[] | null;
  admin_image_alt_texts: string[] | null;
  admin_geographic_anchor: string | null;
  admin_internal_link_targets: Record<string, unknown> | null;
  admin_condition_grade: 'Excellent' | 'Good' | 'Fair' | null;
  admin_price_aed: number | null;
  admin_negotiable: boolean | null;
}>;

// Audit log entry shape for the read-only audit panel in the detail editor.
export interface AuditLogEntry {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Filters available on the list view.
export type PendingFilter = 'all' | 'needs_review' | 'quick_eligible';

// Whitelist of admin override columns the PATCH route accepts. Defined
// here (and exported) so server and client agree on the field set.
export const ADMIN_EDITABLE_FIELDS = [
  'admin_brand',
  'admin_item_name',
  'admin_product_type',
  'admin_category',
  'admin_seo_title',
  'admin_meta_description',
  'admin_description',
  'admin_slug',
  'admin_spec_table',
  'admin_faqs',
  'admin_trust_signals',
  'admin_image_alt_texts',
  'admin_geographic_anchor',
  'admin_internal_link_targets',
  'admin_condition_grade',
  'admin_price_aed',
  'admin_negotiable',
] as const;

// Columns used by the list view + detail editor — keep selects tight
// to avoid shipping the full ~150-column row to the client.
export const PENDING_ITEM_COLUMNS = [
  'id',
  'status',
  'created_at',
  'worker_id',
  'worker_shop_id',
  'worker_condition_type',
  'worker_condition_grade',
  'worker_negotiable',
  'worker_price_aed',
  'worker_note',
  'worker_photo_brand_url',
  'worker_photo_2_url',
  'worker_photo_3_url',
  'worker_photo_barcode_url',
  'worker_submitted_at',
  'ai_barcode_extracted',
  'ai_label_item_type',
  'ai_brand',
  'ai_item_name',
  'ai_product_type',
  'ai_category',
  'ai_seo_title',
  'ai_h1_title',
  'ai_meta_description',
  'ai_slug',
  'ai_description',
  'ai_spec_table',
  'ai_faqs',
  'ai_image_alt_texts',
  'ai_geographic_anchor',
  'ai_trust_signals',
  'ai_internal_link_targets',
  'ai_product_schema',
  'ai_faq_schema',
  'ai_confidence_score',
  'ai_flags',
  'ai_generated_at',
  'ai_prompt_version',
  'ai_model_used',
  'admin_brand',
  'admin_item_name',
  'admin_product_type',
  'admin_category',
  'admin_seo_title',
  'admin_meta_description',
  'admin_description',
  'admin_slug',
  'admin_spec_table',
  'admin_faqs',
  'admin_trust_signals',
  'admin_image_alt_texts',
  'admin_geographic_anchor',
  'admin_internal_link_targets',
  'admin_condition_grade',
  'admin_price_aed',
  'admin_negotiable',
  'admin_approved_at',
  'admin_approved_by',
].join(', ');
