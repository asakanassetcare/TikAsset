-- Migration 19: Add 'service' to user_role enum
-- Must commit before using the new value (see migration 20)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service';
