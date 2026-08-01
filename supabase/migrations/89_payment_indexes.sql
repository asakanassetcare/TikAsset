CREATE INDEX IF NOT EXISTS idx_payments_paid_date    ON payments(paid_date);
CREATE INDEX IF NOT EXISTS idx_payments_approved_at  ON payments(approved_at);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by  ON payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_receipts_recorded_by  ON receipts(recorded_by);
