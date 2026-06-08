-- Migration 60: Rent advance payments (prepaid future rent)
-- Allows active tenants to prepay rent months in advance.
-- When generate_monthly_invoice runs, it auto-applies the balance.

CREATE SEQUENCE IF NOT EXISTS seq_rent_advance_number;

CREATE TABLE rent_advance_payments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_number        text          NOT NULL UNIQUE,
  contract_id           uuid          NOT NULL REFERENCES contracts(id),
  tenant_id             uuid          NOT NULL REFERENCES tenants(id),
  room_id               uuid          NOT NULL REFERENCES rooms(id),
  months_count          int           NOT NULL CHECK (months_count >= 1),
  monthly_rent_snapshot numeric(12,2) NOT NULL,
  paid_amount           numeric(12,2) NOT NULL CHECK (paid_amount > 0),
  remaining_amount      numeric(12,2) NOT NULL,
  slip_url              text,
  bank_name             text,
  bank_reference        text,
  note                  text,
  status                text          NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'fully_used', 'refunded')),
  created_by            uuid          REFERENCES auth.users(id),
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION before_insert_rent_advance()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.advance_number IS NULL OR NEW.advance_number = '' THEN
    NEW.advance_number := next_number('RAP', 'seq_rent_advance_number');
  END IF;
  IF NEW.remaining_amount IS NULL THEN
    NEW.remaining_amount := NEW.paid_amount;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_rent_advance_before_insert
  BEFORE INSERT ON rent_advance_payments
  FOR EACH ROW EXECUTE FUNCTION before_insert_rent_advance();

ALTER TABLE rent_advance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rap_select" ON rent_advance_payments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "rap_insert" ON rent_advance_payments
  FOR INSERT WITH CHECK (is_operational());

CREATE POLICY "rap_update" ON rent_advance_payments
  FOR UPDATE USING (is_operational());
