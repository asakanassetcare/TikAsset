-- Migration 35: Add missing note column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS note text;
