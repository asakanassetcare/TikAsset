-- Migration 27: Add rejection_note column to move_outs
ALTER TABLE move_outs ADD COLUMN IF NOT EXISTS rejection_note text;
