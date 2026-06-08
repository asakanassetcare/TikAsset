-- Migration 42: Add checklist attachment columns for move-in and move-out
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS checklist_in_url  text;
ALTER TABLE move_outs ADD COLUMN IF NOT EXISTS checklist_out_url text;
