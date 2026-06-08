-- Migration 49: contract_advance_payments
-- Stores payments received from tenants before contract approval.
-- At approval time, approve_contract deducts these from generated invoices.

CREATE TABLE contract_advance_payments (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid          NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  slip_url    text,
  note        text,
  created_by  uuid          REFERENCES profiles(id),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ON contract_advance_payments(contract_id);

ALTER TABLE contract_advance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read advance payments"
  ON contract_advance_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff insert advance payments"
  ON contract_advance_payments FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "admin delete advance payments"
  ON contract_advance_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'accounting', 'head_staff')
    )
  );

GRANT SELECT, INSERT, DELETE ON contract_advance_payments TO authenticated;
