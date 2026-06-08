-- Migration 53: Add payment recording fields to bookings table
-- Allows staff to record slip/date/bank ref for booking deposit before converting to contract

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS slip_url              text,
  ADD COLUMN IF NOT EXISTS paid_date             date,
  ADD COLUMN IF NOT EXISTS bank_reference        text,
  ADD COLUMN IF NOT EXISTS payment_recorded_by   uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS payment_recorded_at   timestamptz;
