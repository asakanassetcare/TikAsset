-- Migration 83: Snapshot penalty on payment record
-- penalty_amount = net penalty (after discount) charged at paid_date
-- penalty_days   = days used in the calculation (for audit/display)
-- Approved payments must not have these fields overwritten.
-- Remark: app logic currently only updates pending_approve payments. Add a
-- DB-level guard/backfill later if approved-payment immutability or legacy
-- receipt penalty display needs to be enforced at the database layer.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS penalty_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_days   int          NOT NULL DEFAULT 0;
