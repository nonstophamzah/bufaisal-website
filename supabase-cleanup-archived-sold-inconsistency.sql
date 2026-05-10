-- Cleanup: rows where status='archived' AND is_sold=true.
--
-- Context: 2026-05-10 admin-pending investigation. Row d230899f
-- (TV stand) ended up archived AND is_sold=true after a sequence of
-- legacy /admin actions that the audit log doesn't capture (legacy
-- mark_sold doesn't write audit_log). The Phase 5 reject route doesn't
-- touch is_sold so it didn't cause the inconsistency, but the resulting
-- state — "archived (rejected/trashed) AND sold (customer paid)" — is
-- semantically nonsense. Archived means the listing is dead; sold
-- means it transacted. They cannot both be true on the same row.
--
-- This cleanup sets is_sold back to false on every row where status=
-- 'archived' AND is_sold=true. Scope is narrowed to rows that have an
-- 'admin_rejected' audit_log entry, so we only touch rows we know were
-- rejected (not rows that legitimately got archived through some other
-- path that genuinely also marked them sold).
--
-- Run order (idempotent — safe to re-run):
--   1. INSPECT what would change.
--   2. UPDATE.
--   3. VERIFY (count should be 0 after).
--
-- Run in Supabase SQL Editor. Step 1 first.

-- ─────────────────────────────────────────────────────────────────────
-- 1. INSPECT — show every affected row with full context.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  s.id,
  s.status,
  s.is_sold,
  s.is_published,
  s.item_name,
  s.ai_item_name,
  s.approved_at,
  s.approved_by,
  (
    SELECT MAX(created_at)
    FROM audit_log a
    WHERE a.item_id = s.id AND a.action = 'admin_rejected'
  ) AS rejected_at
FROM shop_items s
WHERE s.status = 'archived'
  AND s.is_sold = true
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.item_id = s.id AND a.action = 'admin_rejected'
  )
ORDER BY rejected_at DESC NULLS LAST;

-- ─────────────────────────────────────────────────────────────────────
-- 2. UPDATE — clear is_sold on rows that were rejected via /admin/pending.
--    Leaves status='archived' alone (that's the correct end state for
--    rejected items). Does NOT touch is_published — Phase 5 reject
--    already correctly set it to false.
-- ─────────────────────────────────────────────────────────────────────

UPDATE shop_items s
SET is_sold = false
WHERE s.status = 'archived'
  AND s.is_sold = true
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.item_id = s.id AND a.action = 'admin_rejected'
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. VERIFY — should return 0 rows.
-- ─────────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS rows_still_inconsistent
FROM shop_items s
WHERE s.status = 'archived'
  AND s.is_sold = true
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.item_id = s.id AND a.action = 'admin_rejected'
  );

-- Spot-check the TV stand row specifically:
SELECT id, status, is_sold, is_published, item_name
FROM shop_items
WHERE id = 'd230899f-8919-4b0f-88be-49b21eca7203';
