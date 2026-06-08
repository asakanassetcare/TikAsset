-- Migration 37: Add outstanding_invoice_total to move_outs
-- Stores snapshot of outstanding invoices at time staff fills in move-out data.
-- Included in net settlement calculation (deposit - deductions - outstanding).
ALTER TABLE move_outs
  ADD COLUMN IF NOT EXISTS outstanding_invoice_total numeric(12,2) NOT NULL DEFAULT 0;
