-- ═══════════════════════════════════════════════════════════════════════════
-- Spare Parts Usage Tracking
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: record which spare parts were installed into which repair items
--          so managers can audit repair history per item. Scope (v1, per
--          Hooman, April 2026): usage log only — no shelf inventory, no
--          harvest flow, no failure tracking. Data model is future-proof
--          so those layers can be added later without migrations.
--
-- Runs AFTER: supabase-appliances-v2.sql (needs appliance_items)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appliance_spare_parts_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What was installed
  part_barcode     TEXT NOT NULL,            -- manufacturer barcode; NOT unique (identical parts repeat)
  part_label_text  TEXT,                     -- descriptive text from label (OCR / manual)
  part_type        TEXT,                     -- enum-ish: compressor, motor, pcb, thermostat, etc.

  -- Where it went
  installed_in_item_id UUID NOT NULL REFERENCES appliance_items(id) ON DELETE CASCADE,

  -- Who, when
  installed_by   TEXT NOT NULL,              -- worker name from sessionStorage.app_worker
  date_installed TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evidence
  photo_url TEXT NOT NULL,                   -- Cloudinary URL, mandatory

  -- Free-text
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by item (for item detail panel & "parts in this item" query)
CREATE INDEX IF NOT EXISTS idx_parts_usage_item
  ON appliance_spare_parts_usage(installed_in_item_id);

-- Fast lookup by part barcode (manager searching "where did barcode X go")
CREATE INDEX IF NOT EXISTS idx_parts_usage_barcode
  ON appliance_spare_parts_usage(part_barcode);

-- Fast chronological listing (manager dashboard feed)
CREATE INDEX IF NOT EXISTS idx_parts_usage_date
  ON appliance_spare_parts_usage(date_installed DESC);

-- Fast lookup by worker (manager wants "parts logged by tech X this week")
CREATE INDEX IF NOT EXISTS idx_parts_usage_worker
  ON appliance_spare_parts_usage(installed_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: service_role only. All writes and reads go through /api/appliances,
-- which uses supabaseAdmin. Anon key must not touch this table.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE appliance_spare_parts_usage ENABLE ROW LEVEL SECURITY;

-- Drop any previous policies idempotently
DROP POLICY IF EXISTS "Service role full access" ON appliance_spare_parts_usage;

CREATE POLICY "Service role full access"
  ON appliance_spare_parts_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Explicit denial for anon / authenticated (defense in depth)
DROP POLICY IF EXISTS "Block anon reads" ON appliance_spare_parts_usage;
DROP POLICY IF EXISTS "Block anon writes" ON appliance_spare_parts_usage;

-- Note: with RLS on and no anon policy, anon is already blocked. The two
-- DROP lines above are here so if earlier iterations of this file created
-- permissive anon policies, they get removed cleanly.

-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at trigger not needed — this table is append-only by design.
-- To correct an entry, the manager will delete + re-insert via the dashboard.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE appliance_spare_parts_usage IS
  'Append-only log of spare parts installed into repair items by Jurf technicians.';
COMMENT ON COLUMN appliance_spare_parts_usage.part_barcode IS
  'Manufacturer barcode from the part label. NOT unique — identical parts share codes.';
COMMENT ON COLUMN appliance_spare_parts_usage.part_label_text IS
  'Descriptive text from the label (e.g. "Compressor LG LDA-204V"), extracted by Gemini or typed manually.';
COMMENT ON COLUMN appliance_spare_parts_usage.installed_in_item_id IS
  'The appliance_items row this part was installed into. Must be an item the submitting worker has claimed and is in_repair/repaired.';
