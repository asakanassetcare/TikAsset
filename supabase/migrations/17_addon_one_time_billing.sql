-- Migration 17: Include one_time addons in monthly invoice generation
-- After a one_time addon is billed it gets deactivated automatically.

CREATE OR REPLACE FUNCTION generate_monthly_invoice(
  p_contract_id uuid,
  p_period text   -- 'YYYY-MM'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract contracts%rowtype;
  v_invoice_id uuid;
  v_period_start date;
  v_period_end date;
  v_due_date date;
  v_addon record;
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  IF v_contract.status NOT IN ('active') THEN
    RETURN NULL;
  END IF;

  v_period_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  IF v_period_start > v_contract.contract_end_date THEN RETURN NULL; END IF;
  IF v_period_end < v_contract.contract_start_date THEN RETURN NULL; END IF;

  v_due_date := (v_period_start + (v_contract.payment_day - 1) * interval '1 day')::date;

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE contract_id = p_contract_id
      AND billing_period = p_period
      AND invoice_type = 'monthly_rent'
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO invoices(invoice_type, contract_id, tenant_id, room_id,
                       billing_period, issue_date, due_date, status, note)
  VALUES ('monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          p_period, current_date, v_due_date, 'pending',
          'ค่าเช่ารายเดือน ' || p_period)
  RETURNING id INTO v_invoice_id;

  -- main rent line
  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (v_invoice_id, 'ค่าเช่าห้อง ' ||
          (SELECT room_number FROM rooms WHERE id = v_contract.room_id) ||
          ' เดือน ' || p_period,
          'rent', 1, v_contract.monthly_rent, v_contract.monthly_rent, 1);

  -- monthly recurring addons (within date range)
  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id
      AND is_active = true
      AND billing_cycle = 'monthly'
      AND (start_date IS NULL OR start_date <= v_period_end)
      AND (end_date IS NULL OR end_date >= v_period_start)
  LOOP
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name, 'addon', 1, v_addon.amount, v_addon.amount, 10);
  END LOOP;

  -- one-time charges: bill once then deactivate
  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id
      AND is_active = true
      AND billing_cycle = 'one_time'
  LOOP
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name, 'addon', 1, v_addon.amount, v_addon.amount, 20);

    UPDATE contract_addons SET is_active = false WHERE id = v_addon.id;
  END LOOP;

  RETURN v_invoice_id;
END $$;
