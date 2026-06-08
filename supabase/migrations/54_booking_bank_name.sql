-- Migration 54: Add bank_name to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bank_name text;
