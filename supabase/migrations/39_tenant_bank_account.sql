-- Migration 39: Add bank account fields to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bank_name           text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name   text;
