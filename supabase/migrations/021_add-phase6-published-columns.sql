-- =====================================================================
-- 021 — Phase 6.1: add missing published_* columns identified in audit
-- dated 2026-05-10
-- =====================================================================
--
-- Spec:  docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md
-- Audit: PR #37 thread / Phase 6.0 audit on 2026-05-10
--
-- The Phase 1B migration (supabase-phase1-listing-generator.sql) created
-- 12 published_* columns but omitted five fields the AI pipeline already
-- populates on every approved row. Phase 6.3 needs all five live on the
-- public product page (schema markup, alt texts, H1, geographic anchor).
--
--   published_h1_title          ← ai_h1_title           (text)
--   published_geographic_anchor ← ai_geographic_anchor  (text)
--   published_image_alt_texts   ← ai_image_alt_texts    (jsonb)
--   published_product_schema    ← ai_product_schema     (jsonb)
--   published_faq_schema        ← ai_faq_schema         (jsonb)
--
-- jsonb (not json) for the three structured columns matches the existing
-- pattern (published_spec_table, published_faqs, published_trust_signals
-- are all jsonb).
--
-- This migration:
--   1. Adds the five columns (all nullable, no defaults, no constraints).
--   2. Backfills them from their ai_* counterparts on the 5 existing
--      status='published' rows so the read-path switch in 6.3 has data
--      on day 1.
--
-- Add-only. Idempotent:
--   - ADD COLUMN IF NOT EXISTS makes the schema half a no-op on rerun.
--   - COALESCE on each backfill assignment makes the data half a no-op
--     for rows already populated — including any future admin overrides
--     or 6.2 publish-time writes that diverge from ai_*.
--
-- ALTER TABLE ADD COLUMN with nullable + no default is metadata-only in
-- modern Postgres; shop_items has 121 rows, runtime well under 1s.
-- =====================================================================

BEGIN;


-- ---------------------------------------------------------------------
-- Section 1 — Add the five missing published_* columns
-- ---------------------------------------------------------------------

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS published_h1_title          text,
  ADD COLUMN IF NOT EXISTS published_geographic_anchor text,
  ADD COLUMN IF NOT EXISTS published_image_alt_texts   jsonb,
  ADD COLUMN IF NOT EXISTS published_product_schema    jsonb,
  ADD COLUMN IF NOT EXISTS published_faq_schema        jsonb;


-- ---------------------------------------------------------------------
-- Section 2 — Backfill from ai_* on status='published' rows
-- ---------------------------------------------------------------------
-- Single UPDATE so all five columns settle in one row touch. COALESCE
-- on each assignment preserves any value already present, making this
-- safe to rerun without clobbering 6.2 publish-time writes that may
-- diverge from the original ai_* output.

UPDATE shop_items
   SET published_h1_title          = COALESCE(published_h1_title,          ai_h1_title),
       published_geographic_anchor = COALESCE(published_geographic_anchor, ai_geographic_anchor),
       published_image_alt_texts   = COALESCE(published_image_alt_texts,   ai_image_alt_texts),
       published_product_schema    = COALESCE(published_product_schema,    ai_product_schema),
       published_faq_schema        = COALESCE(published_faq_schema,        ai_faq_schema)
 WHERE status = 'published';


COMMIT;
