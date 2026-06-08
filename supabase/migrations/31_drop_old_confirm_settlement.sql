-- Migration 31: Drop old 1-param confirm_settlement_completed to resolve overload ambiguity.
-- The canonical 4-param version (with defaults) from migration 30 remains.
DROP FUNCTION IF EXISTS confirm_settlement_completed(uuid);
