-- Migration 80: include rent advance receipts in accounting recording.

ALTER TABLE rent_advance_payments
  ADD COLUMN IF NOT EXISTS accounting_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_recorded_by uuid REFERENCES profiles(id);

CREATE POLICY "rap_accounting_update" ON rent_advance_payments
  FOR UPDATE
  USING (is_accounting())
  WITH CHECK (is_accounting());
