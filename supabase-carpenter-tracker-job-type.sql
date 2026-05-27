-- ═══════════════════════════════════════════════════════════════════
-- BU FAISAL — CARPENTER TRACKER: add job_type (USED | NEW)
-- Run in Supabase Dashboard > SQL Editor (additive migration).
--
-- Goal: same item name (e.g. "Cupboard 02 Door") can exist in BOTH the
-- USED list (remake work) and the NEW list (built from scratch) at
-- different rates. The single-column UNIQUE(item_type) on
-- carpenter_rates blocks that, so it is replaced by a composite
-- UNIQUE(job_type, item_type).
--
-- All existing carpenter_rates rows + all existing carpenter_items
-- rows default to 'USED' (all prior work was remake work).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. carpenter_rates: add job_type column (default 'USED') ───────
ALTER TABLE carpenter_rates
  ADD COLUMN job_type TEXT NOT NULL DEFAULT 'USED';

ALTER TABLE carpenter_rates
  ADD CONSTRAINT carpenter_rates_job_type_chk
  CHECK (job_type IN ('USED', 'NEW'));

-- ── 2. Swap UNIQUE(item_type) for UNIQUE(job_type, item_type) ──────
-- The original inline `item_type TEXT UNIQUE` produced auto-named
-- constraint `carpenter_rates_item_type_key`.
ALTER TABLE carpenter_rates
  DROP CONSTRAINT carpenter_rates_item_type_key;

ALTER TABLE carpenter_rates
  ADD CONSTRAINT carpenter_rates_job_type_item_type_key
  UNIQUE (job_type, item_type);

-- ── 3. Insert the 5 NEW rates ──────────────────────────────────────
INSERT INTO carpenter_rates (item_type, rate_aed, job_type) VALUES
  ('Single Door Cupboard',  5, 'NEW'),
  ('Cupboard 02 Door',     10, 'NEW'),
  ('Cupboard 03 Door',     10, 'NEW'),
  ('Cupboard 04 Door',     15, 'NEW'),
  ('Bed Room Set',         40, 'NEW')
ON CONFLICT (job_type, item_type) DO NOTHING;

-- ── 4. carpenter_items: add job_type column (default 'USED') ───────
ALTER TABLE carpenter_items
  ADD COLUMN job_type TEXT NOT NULL DEFAULT 'USED';

ALTER TABLE carpenter_items
  ADD CONSTRAINT carpenter_items_job_type_chk
  CHECK (job_type IN ('USED', 'NEW'));

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════
SELECT job_type, COUNT(*) AS rate_count
FROM carpenter_rates
GROUP BY job_type
ORDER BY job_type;
-- Expect: NEW = 5, USED = 18

SELECT job_type, COUNT(*) AS item_count
FROM carpenter_items
GROUP BY job_type
ORDER BY job_type;
-- Expect: USED = (all existing rows), no NEW rows yet
