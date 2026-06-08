-- Migration 58: Add termination document field to move_outs
-- Required when is_early_termination = true

ALTER TABLE move_outs
  ADD COLUMN IF NOT EXISTS termination_doc_url text;
