-- ============================================================
-- Migration 23: Receipts table
-- ============================================================

CREATE TABLE receipts (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text          UNIQUE NOT NULL,
  amount         numeric(12,2) NOT NULL,
  description    text,
  payer_name     text,
  ref_table      text,
  ref_id         uuid,
  issued_by      uuid          REFERENCES profiles(id),
  issued_at      timestamptz   NOT NULL DEFAULT now(),
  status         text          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'recorded')),
  recorded_by    uuid          REFERENCES profiles(id),
  recorded_at    timestamptz,
  created_at     timestamptz   NOT NULL DEFAULT now()
);

-- Auto-generate receipt number: RC-YYYY-NNNNN
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_seq  int;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(receipt_number, '-', 3) AS int)
  ), 0) + 1
  INTO v_seq
  FROM receipts
  WHERE receipt_number LIKE 'RC-' || v_year || '-%';

  NEW.receipt_number := 'RC-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_receipt_number
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION generate_receipt_number();

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_select" ON receipts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "receipts_update" ON receipts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
