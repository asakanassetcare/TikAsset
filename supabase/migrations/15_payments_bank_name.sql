-- Migration 15: Add bank_name column to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_name text;
