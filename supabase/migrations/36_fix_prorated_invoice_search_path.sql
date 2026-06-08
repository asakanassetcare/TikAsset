-- Migration 36: Fix generate_prorated_first_invoice
-- 1. Add SET search_path = public (was missing, causing silent failure)
-- 2. Use move_in_date as fallback so prorate is created at approval time
-- 3. Update approve_contract to call prorate alongside the initial invoice

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
  v_move_in        date;
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

  -- Use actual move-in date if recorded, otherwise fall back to planned move_in_date
  v_move_in := COALESCE(v_contract.actual_move_in_at::date, v_contract.move_in_date);

  IF v_move_in IS NULL THEN
    RETURN NULL;
  END IF;

  -- only prorate if move-in is NOT on the 1st
  IF extract(day FROM v_move_in) = 1 THEN
    RETURN NULL;
  END IF;

  v_month_end     := (date_trunc('month', v_move_in) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day FROM v_month_end)::int;
  v_days_charged  := v_days_in_month - extract(day FROM v_move_in)::int + 1;
  v_prorated      := round(v_contract.monthly_rent * v_days_charged / v_days_in_month, 2);
  v_period        := to_char(v_move_in, 'YYYY-MM');
  v_due_date      := v_move_in;

  -- guard duplicate
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
          format('ค่าเช่า prorated %s–%s', to_char(v_move_in,'DD/MM'), to_char(v_month_end,'DD/MM')))
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (v_invoice_id,
          format('ค่าเช่า prorated %s วัน (%s–%s)', v_days_charged,
                 to_char(v_move_in,'DD/MM/YYYY'), to_char(v_month_end,'DD/MM/YYYY')),
          'rent', v_days_charged, round(v_contract.monthly_rent / v_days_in_month, 2),
          v_prorated, 1);

  -- prorated add-ons
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

-- Update approve_contract to also create prorated first-month invoice at approval time
CREATE OR REPLACE FUNCTION approve_contract(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status     contract_status;
  v_invoice_id uuid;
BEGIN
  SELECT status INTO v_status FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract not found';
  END IF;
  IF v_status != 'pending_approve' THEN
    RAISE EXCEPTION 'contract is not pending_approve (current: %)', v_status;
  END IF;

  UPDATE contracts SET status = 'approved', updated_at = now() WHERE id = p_contract_id;

  -- Create deposit + advance invoice
  v_invoice_id := generate_contract_initial_invoice(p_contract_id);

  -- Create prorated first-month rent invoice (uses move_in_date; no-op if move-in is on the 1st)
  PERFORM generate_prorated_first_invoice(p_contract_id);

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION approve_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_contract(uuid) TO authenticated;
