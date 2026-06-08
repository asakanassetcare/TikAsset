-- Migration 40: Add bookbank_url to move_outs for tenant bank book attachment
ALTER TABLE move_outs
  ADD COLUMN IF NOT EXISTS bookbank_url text;
