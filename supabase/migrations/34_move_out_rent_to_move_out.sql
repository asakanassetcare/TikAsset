-- Migration 34: Add rent_to_move_out for early termination cases.
-- Stores pro-rated/partial rent owed from last invoice period to move-out date.
ALTER TABLE move_outs
  ADD COLUMN IF NOT EXISTS rent_to_move_out numeric(12,2) NOT NULL DEFAULT 0;
