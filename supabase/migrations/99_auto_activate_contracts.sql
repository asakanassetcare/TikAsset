CREATE OR REPLACE FUNCTION generate_invoices_for_current_month()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text;
  v_contract record;
  v_count int := 0;
  v_inv uuid;
BEGIN
  UPDATE contracts
  SET actual_move_in_at = contract_start_date::timestamptz
  WHERE status = 'approved'
    AND contract_start_date <= current_date
    AND actual_move_in_at IS NULL;

  v_period := to_char(current_date, 'YYYY-MM');
  FOR v_contract IN
    SELECT id FROM contracts WHERE status = 'active'
  LOOP
    v_inv := generate_monthly_invoice(v_contract.id, v_period);
    IF v_inv IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END $$;

UPDATE contracts
SET actual_move_in_at = contract_start_date::timestamptz
WHERE status = 'approved'
  AND contract_start_date <= current_date
  AND actual_move_in_at IS NULL;
