-- =====================================================================
-- Phase 1 Migration — Bufaisal Listing Generator v1.1 schema separation
-- =====================================================================
--
-- Spec:    docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md
-- Decision: docs/Bufaisal-Decisions-Log-v1_1-Addendum.docx (2026-05-07)
--
-- This migration:
--   1. Renames the only in-use legacy status value: pending_review -> pending
--      (46 rows affected, per production introspection on 2026-05-07).
--      `archived` (59) and NULL (9) are left untouched.
--      `agent_drafting` is referenced in code but has 0 rows in production;
--      the code-side rename to `processing` happens in Phase 3, not here.
--   2. Adds 67 new nullable columns to shop_items in four prefix groups
--      (worker_*, ai_*, admin_*, published_*) so worker/AI/admin/published
--      values stay separable per the schema-separation rule.
--   3. Creates the audit_log table + index.
--   4. Locks audit_log RLS so only service_role can read it.
--
-- Add-only. No DROP, no ALTER on existing columns, no touch on the
-- existing `slug` column or its UNIQUE index, no touch on shop_items RLS.
--
-- Idempotent: rerunning is safe (IF NOT EXISTS / WHERE-guarded UPDATE).
--
-- Estimated runtime: under 1 second. shop_items has 114 rows; ALTER TABLE
-- ADD COLUMN with nullable + no default is a metadata-only operation in
-- modern Postgres and does not rewrite the table.
-- =====================================================================

BEGIN;


-- ---------------------------------------------------------------------
-- Section 1 — Status value rename
-- ---------------------------------------------------------------------
-- Production has 46 rows in 'pending_review'. The new state machine uses
-- the shorter 'pending'. Existing 'archived' rows and NULL rows are
-- left unchanged. Rerunning is a no-op once the rename is done.

UPDATE shop_items
   SET status = 'pending'
 WHERE status = 'pending_review';


-- ---------------------------------------------------------------------
-- Section 2 — Worker-provided columns (12)
-- ---------------------------------------------------------------------
-- Set at submit time by /api/team/items. AI never overwrites these.
-- Worker ground truth is structurally protected by the prefix.

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS worker_condition_type    text,         -- 'Used' | 'New'
  ADD COLUMN IF NOT EXISTS worker_condition_grade   text,         -- 'Excellent' | 'Good' | 'Fair' | NULL when New
  ADD COLUMN IF NOT EXISTS worker_negotiable        boolean,
  ADD COLUMN IF NOT EXISTS worker_price_aed         integer,
  ADD COLUMN IF NOT EXISTS worker_note              text,
  ADD COLUMN IF NOT EXISTS worker_shop_id           text,
  ADD COLUMN IF NOT EXISTS worker_photo_brand_url   text,
  ADD COLUMN IF NOT EXISTS worker_photo_2_url       text,
  ADD COLUMN IF NOT EXISTS worker_photo_3_url       text,
  ADD COLUMN IF NOT EXISTS worker_photo_barcode_url text,
  ADD COLUMN IF NOT EXISTS worker_submitted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS worker_id                text;


-- ---------------------------------------------------------------------
-- Section 3 — AI-generated columns (24)
-- ---------------------------------------------------------------------
-- Set by the background generation job when status flips from
-- 'processing' -> 'pending'. Output map: see
-- docs/Bufaisal-Listing-Generator-Prompt-v1_0_1.md section 4.

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS ai_barcode_extracted     text,
  ADD COLUMN IF NOT EXISTS ai_label_item_type       text,
  ADD COLUMN IF NOT EXISTS ai_brand                 text,
  ADD COLUMN IF NOT EXISTS ai_item_name             text,
  ADD COLUMN IF NOT EXISTS ai_product_type          text,
  ADD COLUMN IF NOT EXISTS ai_category              text,
  ADD COLUMN IF NOT EXISTS ai_seo_title             text,
  ADD COLUMN IF NOT EXISTS ai_h1_title              text,
  ADD COLUMN IF NOT EXISTS ai_meta_description      text,
  ADD COLUMN IF NOT EXISTS ai_slug                  text,
  ADD COLUMN IF NOT EXISTS ai_description           text,
  ADD COLUMN IF NOT EXISTS ai_spec_table            jsonb,
  ADD COLUMN IF NOT EXISTS ai_faqs                  jsonb,
  ADD COLUMN IF NOT EXISTS ai_image_alt_texts       jsonb,
  ADD COLUMN IF NOT EXISTS ai_geographic_anchor     text,
  ADD COLUMN IF NOT EXISTS ai_trust_signals         jsonb,
  ADD COLUMN IF NOT EXISTS ai_internal_link_targets jsonb,
  ADD COLUMN IF NOT EXISTS ai_product_schema        jsonb,
  ADD COLUMN IF NOT EXISTS ai_faq_schema            jsonb,
  ADD COLUMN IF NOT EXISTS ai_confidence_score      double precision,    -- 0.0–1.0
  ADD COLUMN IF NOT EXISTS ai_flags                 jsonb,                -- array of flag strings
  ADD COLUMN IF NOT EXISTS ai_generated_at          timestamptz,
  ADD COLUMN IF NOT EXISTS ai_prompt_version        text,
  ADD COLUMN IF NOT EXISTS ai_model_used            text;


-- ---------------------------------------------------------------------
-- Section 4 — Admin override columns (19)
-- ---------------------------------------------------------------------
-- Populated only when the admin edits an AI value during pending review.
-- ai_* values stay intact; admin_* layers on top. published_* is
-- computed at approval as COALESCE(admin_*, ai_*).

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS admin_brand                 text,
  ADD COLUMN IF NOT EXISTS admin_item_name             text,
  ADD COLUMN IF NOT EXISTS admin_product_type          text,
  ADD COLUMN IF NOT EXISTS admin_category              text,
  ADD COLUMN IF NOT EXISTS admin_seo_title             text,
  ADD COLUMN IF NOT EXISTS admin_meta_description      text,
  ADD COLUMN IF NOT EXISTS admin_description           text,
  ADD COLUMN IF NOT EXISTS admin_slug                  text,
  ADD COLUMN IF NOT EXISTS admin_spec_table            jsonb,
  ADD COLUMN IF NOT EXISTS admin_faqs                  jsonb,
  ADD COLUMN IF NOT EXISTS admin_trust_signals         jsonb,
  ADD COLUMN IF NOT EXISTS admin_image_alt_texts       jsonb,
  ADD COLUMN IF NOT EXISTS admin_geographic_anchor     text,
  ADD COLUMN IF NOT EXISTS admin_internal_link_targets jsonb,
  ADD COLUMN IF NOT EXISTS admin_condition_grade       text,         -- override worker grade only via flagged disagreement
  ADD COLUMN IF NOT EXISTS admin_price_aed             integer,      -- overrides worker_price_aed when set
  ADD COLUMN IF NOT EXISTS admin_negotiable            boolean,      -- overrides worker_negotiable when set
  ADD COLUMN IF NOT EXISTS admin_approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS admin_approved_by           text;


-- ---------------------------------------------------------------------
-- Section 5 — Published columns (12)
-- ---------------------------------------------------------------------
-- Materialized at approval time. Public site reads these. The legacy
-- `slug` column and its UNIQUE index are deliberately untouched —
-- published_slug is the new canonical slug going forward.

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS published_brand            text,
  ADD COLUMN IF NOT EXISTS published_item_name        text,
  ADD COLUMN IF NOT EXISTS published_product_type     text,
  ADD COLUMN IF NOT EXISTS published_category         text,
  ADD COLUMN IF NOT EXISTS published_seo_title        text,
  ADD COLUMN IF NOT EXISTS published_meta_description text,
  ADD COLUMN IF NOT EXISTS published_description      text,
  ADD COLUMN IF NOT EXISTS published_spec_table       jsonb,
  ADD COLUMN IF NOT EXISTS published_faqs             jsonb,
  ADD COLUMN IF NOT EXISTS published_trust_signals    jsonb,
  ADD COLUMN IF NOT EXISTS published_slug             text,
  ADD COLUMN IF NOT EXISTS published_at               timestamptz;


-- ---------------------------------------------------------------------
-- Section 6 — audit_log table
-- ---------------------------------------------------------------------
-- Immutable forensic record of every meaningful state change. Spec 1C.
-- item_id uses ON DELETE SET NULL so the audit trail outlives any
-- shop_items row that might be deleted (today shop_items is
-- archive-only, but the audit log should not be implicitly destroyable
-- if that ever changes).

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid REFERENCES shop_items(id) ON DELETE SET NULL,
  action       text NOT NULL,           -- 'submitted' | 'ai_completed' | 'admin_approved' | 'admin_edited' | ...
  actor_type   text NOT NULL,           -- 'worker' | 'ai' | 'admin' | 'system'
  actor_id     text,                    -- worker_id, admin email, or e.g. 'ai-v1.0'
  before_state jsonb,
  after_state  jsonb,
  metadata     jsonb,                   -- error messages, flags, confidence, etc.
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_item
  ON audit_log(item_id, created_at DESC);


-- ---------------------------------------------------------------------
-- Section 7 — RLS for audit_log
-- ---------------------------------------------------------------------
-- Anon and authenticated roles get NO policies — they can never read
-- the audit log. service_role bypasses RLS by design in Supabase
-- (it runs as the postgres role), so the background job and admin API
-- routes that already use supabaseAdmin will read/write normally.
--
-- shop_items RLS is intentionally NOT touched in this migration.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;


COMMIT;


-- =====================================================================
-- Verification queries — run these AFTER commit, not inside the txn
-- =====================================================================
-- 1. Status rename took effect:
--      SELECT status, COUNT(*) FROM shop_items GROUP BY status ORDER BY 2 DESC;
--    Expected: archived=59, pending=46, NULL=9, total=114.
--
-- 2. New columns exist (count should be 33 + 67 = 100):
--      SELECT COUNT(*) FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='shop_items';
--
-- 3. audit_log exists, is empty, has RLS on:
--      SELECT relrowsecurity FROM pg_class
--       WHERE relname='audit_log' AND relnamespace='public'::regnamespace;
--      SELECT COUNT(*) FROM audit_log;
--
-- 4. Anon really cannot read audit_log (run via the anon REST endpoint,
--    not the SQL editor): GET /rest/v1/audit_log?select=id&limit=1
--    should return 401/permission denied or an empty array.


-- =====================================================================
-- Rollback procedure (NOT auto-executed)
-- =====================================================================
-- If this migration needs to be reversed before any new code starts
-- writing to the new columns, run the following in a separate
-- transaction. Order matters: drop audit_log FK references first, then
-- the new columns, then revert the status values.
--
-- BEGIN;
--   DROP TABLE IF EXISTS audit_log;
--   ALTER TABLE shop_items
--     DROP COLUMN IF EXISTS worker_condition_type,
--     DROP COLUMN IF EXISTS worker_condition_grade,
--     DROP COLUMN IF EXISTS worker_negotiable,
--     DROP COLUMN IF EXISTS worker_price_aed,
--     DROP COLUMN IF EXISTS worker_note,
--     DROP COLUMN IF EXISTS worker_shop_id,
--     DROP COLUMN IF EXISTS worker_photo_brand_url,
--     DROP COLUMN IF EXISTS worker_photo_2_url,
--     DROP COLUMN IF EXISTS worker_photo_3_url,
--     DROP COLUMN IF EXISTS worker_photo_barcode_url,
--     DROP COLUMN IF EXISTS worker_submitted_at,
--     DROP COLUMN IF EXISTS worker_id,
--     DROP COLUMN IF EXISTS ai_barcode_extracted,
--     DROP COLUMN IF EXISTS ai_label_item_type,
--     DROP COLUMN IF EXISTS ai_brand,
--     DROP COLUMN IF EXISTS ai_item_name,
--     DROP COLUMN IF EXISTS ai_product_type,
--     DROP COLUMN IF EXISTS ai_category,
--     DROP COLUMN IF EXISTS ai_seo_title,
--     DROP COLUMN IF EXISTS ai_h1_title,
--     DROP COLUMN IF EXISTS ai_meta_description,
--     DROP COLUMN IF EXISTS ai_slug,
--     DROP COLUMN IF EXISTS ai_description,
--     DROP COLUMN IF EXISTS ai_spec_table,
--     DROP COLUMN IF EXISTS ai_faqs,
--     DROP COLUMN IF EXISTS ai_image_alt_texts,
--     DROP COLUMN IF EXISTS ai_geographic_anchor,
--     DROP COLUMN IF EXISTS ai_trust_signals,
--     DROP COLUMN IF EXISTS ai_internal_link_targets,
--     DROP COLUMN IF EXISTS ai_product_schema,
--     DROP COLUMN IF EXISTS ai_faq_schema,
--     DROP COLUMN IF EXISTS ai_confidence_score,
--     DROP COLUMN IF EXISTS ai_flags,
--     DROP COLUMN IF EXISTS ai_generated_at,
--     DROP COLUMN IF EXISTS ai_prompt_version,
--     DROP COLUMN IF EXISTS ai_model_used,
--     DROP COLUMN IF EXISTS admin_brand,
--     DROP COLUMN IF EXISTS admin_item_name,
--     DROP COLUMN IF EXISTS admin_product_type,
--     DROP COLUMN IF EXISTS admin_category,
--     DROP COLUMN IF EXISTS admin_seo_title,
--     DROP COLUMN IF EXISTS admin_meta_description,
--     DROP COLUMN IF EXISTS admin_description,
--     DROP COLUMN IF EXISTS admin_slug,
--     DROP COLUMN IF EXISTS admin_spec_table,
--     DROP COLUMN IF EXISTS admin_faqs,
--     DROP COLUMN IF EXISTS admin_trust_signals,
--     DROP COLUMN IF EXISTS admin_image_alt_texts,
--     DROP COLUMN IF EXISTS admin_geographic_anchor,
--     DROP COLUMN IF EXISTS admin_internal_link_targets,
--     DROP COLUMN IF EXISTS admin_condition_grade,
--     DROP COLUMN IF EXISTS admin_price_aed,
--     DROP COLUMN IF EXISTS admin_negotiable,
--     DROP COLUMN IF EXISTS admin_approved_at,
--     DROP COLUMN IF EXISTS admin_approved_by,
--     DROP COLUMN IF EXISTS published_brand,
--     DROP COLUMN IF EXISTS published_item_name,
--     DROP COLUMN IF EXISTS published_product_type,
--     DROP COLUMN IF EXISTS published_category,
--     DROP COLUMN IF EXISTS published_seo_title,
--     DROP COLUMN IF EXISTS published_meta_description,
--     DROP COLUMN IF EXISTS published_description,
--     DROP COLUMN IF EXISTS published_spec_table,
--     DROP COLUMN IF EXISTS published_faqs,
--     DROP COLUMN IF EXISTS published_trust_signals,
--     DROP COLUMN IF EXISTS published_slug,
--     DROP COLUMN IF EXISTS published_at;
--   UPDATE shop_items SET status='pending_review' WHERE status='pending';
-- COMMIT;
--
-- Rollback caveat: if any rows have started writing to the new columns
-- by the time you roll back, those values are lost. Rollback is safe
-- only before Phase 3 ships. After Phase 3, forward-fix instead.

-- End of Phase 1 migration.
