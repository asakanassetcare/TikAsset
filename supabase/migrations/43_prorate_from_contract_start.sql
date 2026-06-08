-- Migration 43: Fix prorate calculation to use contract_start_date instead of move_in_date
-- Rationale: move_in_date / actual_move_in_at is informational only (when tenant physically arrives).
--            Billing should start from contract_start_date regardless.

CREATE OR REPLACE FUNCTION generate_prorated_first_invoice(
  p_contract_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract       contracts%rowtype;
  v_invoice_id     uuid;
  v_start          date;
  v_month_end      date;
  v_days_in_month  int;
  v_days_charged   int;
  v_prorated       numeric(12,2);
  v_period         text;
  v_due_date       date;
  v_addon          record;
  v_addon_prorated numeric(12,2);
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;

  -- Use contract_start_date for billing — move_in_date is for staff reference only
  v_start := v_contract.contract_start_date;

  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  -- No prorate needed when contract starts on the 1st
  IF extract(day FROM v_start) = 1 THEN
    RETURN NULL;
  END IF;

  v_month_end     := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day FROM v_month_end)::int;
  v_days_charged  := v_days_in_month - extract(day FROM v_start)::int + 1;
  v_prorated      := round(v_contract.monthly_rent * v_days_charged / v_days_in_month, 2);
  v_period        := to_char(v_start, 'YYYY-MM');
  v_due_date      := v_start;

  -- Guard duplicate
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE contract_id = p_contract_id
      AND billing_period = v_period
      AND invoice_type = 'monthly_rent'
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO invoices(invoice_type, contract_id, tenant_id, room_id,
                       billing_period, issue_date, due_date, status, note)
  VALUES ('monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          v_period, current_date, v_due_date, 'pending',
          format('ค่าเช่า prorated %s–%s', to_char(v_start,'DD/MM'), to_char(v_month_end,'DD/MM')))
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (v_invoice_id,
          format('ค่าเช่า prorated %s วัน (%s–%s)', v_days_charged,
                 to_char(v_start,'DD/MM/YYYY'), to_char(v_month_end,'DD/MM/YYYY')),
          'rent', v_days_charged, round(v_contract.monthly_rent / v_days_in_month, 2),
          v_prorated, 1);

  -- Prorated add-ons
  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id AND is_active = true AND billing_cycle = 'monthly'
  LOOP
    v_addon_prorated := round(v_addon.amount * v_days_charged / v_days_in_month, 2);
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name || ' (prorated)', 'addon', v_days_charged,
            round(v_addon.amount / v_days_in_month, 2), v_addon_prorated, 10);
  END LOOP;

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION generate_prorated_first_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_prorated_first_invoice(uuid) TO authenticated;
