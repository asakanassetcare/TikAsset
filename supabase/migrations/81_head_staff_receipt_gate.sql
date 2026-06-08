-- Migration 81: add head-staff review gate before accounting.
-- Staff can still record/upload receipts the same way, but accounting should
-- only see rows after head staff approves them.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS head_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejection_reason text;

ALTER TABLE rent_advance_payments
  ADD COLUMN IF NOT EXISTS head_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejection_reason text;

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS head_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejection_reason text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS head_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejection_reason text;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS head_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS head_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_payments_head_approval
  ON payments(status, head_approved_at)
  WHERE status = 'pending_approve';

CREATE INDEX IF NOT EXISTS idx_rent_advance_head_approval
  ON rent_advance_payments(head_approved_at)
  WHERE accounting_recorded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_settlements_head_approval
  ON settlements(status, head_approved_at)
  WHERE status IN ('pending', 'processing', 'paid_by_staff');

CREATE INDEX IF NOT EXISTS idx_bookings_head_approval
  ON bookings(head_approved_at)
  WHERE slip_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_head_approval
  ON receipts(status, head_approved_at)
  WHERE status = 'pending';
