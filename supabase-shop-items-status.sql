-- Sprint 4: add `status` column to shop_items for the agent workflow.
-- Values used by application code:
--   'agent_drafting'  — AI background job is still running
--   'pending_review'  — AI done (success or failure), ready for admin
--   'sent_back'       — admin returned to /team for fixes (future use)
--   NULL              — legacy items, or items that have moved past the
--                       agent pipeline (cleared on admin approve)
--
-- Existing booleans (is_published / is_sold / is_hidden / is_featured)
-- continue to control the live lifecycle. status only describes where
-- in the agent pipeline an item currently is.

ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS status text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_items_status ON shop_items(status)
  WHERE status IS NOT NULL;
