-- Migration 25: Accounting recording columns on payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS accounting_recorded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_recorded_by  uuid REFERENCES profiles(id);
