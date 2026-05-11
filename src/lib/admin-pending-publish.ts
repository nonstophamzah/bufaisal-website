// Phase 5 admin pending dashboard — server-only helpers shared by the
// approve and quick-approve routes.
//
// Computes the published_* values per the Phase 1B contract (admin_*
// override if set, else ai_*) and mirrors them into the legacy columns
// the public site still reads. Phase 6 will switch the public site to
// read published_* directly; once that lands, the legacy mirror block
// below can be deleted.

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { PendingItem } from '@/app/admin/pending/types';
// Re-export from the shared (client-safe) location so callers can import
// either from the publish helper or from the eligibility module.
export {
  hasAnyAdminOverride,
  isQuickApproveEligible,
} from '@/app/admin/pending/lib/eligibility';

/** Pick the admin override if explicitly set, else the AI value. */
function pick<T>(adminVal: T | null | undefined, aiVal: T | null | undefined): T | null {
  if (adminVal !== null && adminVal !== undefined) return adminVal;
  return aiVal ?? null;
}

interface PublishResult {
  /** The diff that was applied (admin overrides only) — for audit metadata. */
  overridesApplied: string[];
  /** The full computed published_* + legacy-mirror update payload. */
  update: Record<string, unknown>;
}

/**
 * Build the publish update object for a pending item.
 *
 * Writes:
 *  - All published_* columns the migration created (per Phase 1B)
 *  - Legacy-column mirrors so bufaisal.ae keeps rendering until Phase 6
 *  - Status flip to 'published' + is_published=true
 *  - admin_approved_at / admin_approved_by audit metadata
 *
 * As of Phase 6.2, all 16 published_* columns are written by this helper
 * (the 5 columns added in PR #38 — published_h1_title,
 * published_geographic_anchor, published_image_alt_texts,
 * published_product_schema, published_faq_schema — now have writes).
 * published_h1_title mirrors pSeoTitle per the locked spec (H1 = SEO title).
 * published_product_schema and published_faq_schema source only from
 * ai_* — there is no admin override layer for these in the current type.
 */
export function buildPublishUpdate(item: PendingItem, adminName: string): PublishResult {
  const now = new Date().toISOString();

  // Compute final published_* values: admin override wins when set.
  const pBrand = pick(item.admin_brand, item.ai_brand);
  const pItemName = pick(item.admin_item_name, item.ai_item_name);
  const pProductType = pick(item.admin_product_type, item.ai_product_type);
  const pCategory = pick(item.admin_category, item.ai_category);
  const pSeoTitle = pick(item.admin_seo_title, item.ai_seo_title);
  const pMetaDescription = pick(item.admin_meta_description, item.ai_meta_description);
  const pDescription = pick(item.admin_description, item.ai_description);
  const pSpecTable = pick(item.admin_spec_table, item.ai_spec_table);
  const pFaqs = pick(item.admin_faqs, item.ai_faqs);
  const pTrustSignals = pick(item.admin_trust_signals, item.ai_trust_signals);
  const pSlug = pick(item.admin_slug, item.ai_slug);
  const pH1Title = pSeoTitle; // h1 always equals seo_title per locked spec
  const pGeographicAnchor = pick(item.admin_geographic_anchor, item.ai_geographic_anchor);
  const pImageAltTexts = pick(item.admin_image_alt_texts, item.ai_image_alt_texts);
  const pProductSchema = item.ai_product_schema; // no admin override layer
  const pFaqSchema = item.ai_faq_schema; // no admin override layer

  // Worker-grade fields: locked rule is "worker wins for condition", but
  // admin can override if the disagreement was flagged. Same pattern for
  // price + negotiable.
  const finalConditionGrade = pick(item.admin_condition_grade, item.worker_condition_grade);
  const finalPrice = pick(item.admin_price_aed, item.worker_price_aed);
  const finalNegotiable =
    item.admin_negotiable !== null
      ? item.admin_negotiable
      : item.worker_negotiable;

  const update: Record<string, unknown> = {
    // ── Phase 1B published_* columns (only the ones the migration created) ──
    published_brand: pBrand,
    published_item_name: pItemName,
    published_product_type: pProductType,
    published_category: pCategory,
    published_seo_title: pSeoTitle,
    published_meta_description: pMetaDescription,
    published_description: pDescription,
    published_spec_table: pSpecTable,
    published_faqs: pFaqs,
    published_trust_signals: pTrustSignals,
    published_slug: pSlug,
    published_h1_title: pH1Title,
    published_geographic_anchor: pGeographicAnchor,
    published_image_alt_texts: pImageAltTexts,
    published_product_schema: pProductSchema,
    published_faq_schema: pFaqSchema,
    published_at: now,

    // ── State + admin audit ──
    status: 'published',
    is_published: true,
    admin_approved_at: now,
    admin_approved_by: adminName,
    // Legacy approval columns the legacy /admin path also writes — keep
    // both in sync so the analytics tab shows the right approver.
    approved_at: now,
    approved_by: adminName,

    // ── Phase 6 bridge — remove when public site reads published_* directly ──
    // bufaisal.ae currently reads item_name, brand, category, condition,
    // sale_price, description, seo_title, seo_description, negotiable,
    // product_type, and barcode from the legacy columns. Without these
    // mirrors, every Phase 5-published item would render as a blank card
    // on the public site (worker submit inserts empty strings for
    // item_name/category to satisfy the legacy NOT NULL constraints).
    // Phase 6 owns the public-site rewrite to read published_* + worker_*
    // directly; once that ships, this block can be deleted in one diff.
    item_name: pItemName ?? '',
    brand: pBrand,
    category: pCategory ?? '',
    description: pDescription,
    seo_title: pSeoTitle,
    seo_description: pMetaDescription,
    product_type: pProductType,
    sale_price: finalPrice,
    negotiable: finalNegotiable,
    condition: finalConditionGrade,
    barcode: item.ai_barcode_extracted,
    // ── End Phase 6 bridge ──
  };

  // List of admin override fields that were actually set — used in the
  // audit_log metadata so we can later answer "which fields did the admin
  // change" without diffing two giant JSONB blobs.
  const overridesApplied: string[] = [];
  const overrideKeys = [
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
  for (const key of overrideKeys) {
    if (item[key] !== null && item[key] !== undefined) overridesApplied.push(key);
  }

  return { overridesApplied, update };
}

/** Insert an audit_log row. Best-effort — failures are logged, not thrown. */
export async function writeAdminAudit(args: {
  itemId: string;
  adminName: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    item_id: args.itemId,
    action: args.action,
    actor_type: 'admin',
    actor_id: args.adminName,
    before_state: args.beforeStatus ? { status: args.beforeStatus } : null,
    after_state: args.afterStatus ? { status: args.afterStatus } : null,
    metadata: args.metadata ?? null,
  });
  if (error) {
    console.error(
      `[admin-pending] audit_log insert failed for ${args.itemId}:`,
      error
    );
  }
}
