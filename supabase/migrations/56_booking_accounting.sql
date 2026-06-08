-- Migration 56: Add accounting recording fields to bookings
-- Allows accounting to acknowledge/record booking payments without approval gate

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accounting_recorded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_recorded_by  uuid REFERENCES profiles(id);
