-- Migration 50: Apply advance payments to invoices at contract approval
-- Adds optional p_advance_payment parameter to invoice generation RPCs.
-- approve_contract now auto-sums contract_advance_payments and deducts from invoices.

-- =====================================================================
-- 1. generate_contract_initial_invoice — accept optional advance deduction
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_contract_initial_invoice(
  p_contract_id     uuid,
  p_advance_payment numeric(12,2) DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract   contracts%rowtype;
  v_invoice_id uuid;
  v_room_number text;
  v_applied    numeric(12,2);
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_contract.room_id;

  -- guard duplicate
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE contract_id = p_contract_id
      AND invoice_type = 'contract_initial'
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO invoices(invoice_type, contract_id, tenant_id, room_id,
                       issue_date, due_date, status)
  VALUES ('contract_initial', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          current_date, v_contract.move_in_date, 'pending')
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES
    (v_invoice_id, format('เงินประกัน ห้อง %s', v_room_number), 'deposit', 1,
     v_contract.deposit_amount, v_contract.deposit_amount, 1),
    (v_invoice_id, 'ค่าเช่าล่วงหน้า', 'advance', 1,
     v_contract.advance_rent_amount, v_contract.advance_rent_amount, 2);

  -- subtract booking deposit if any
  IF COALESCE(v_contract.booking_deposit_applied, 0) > 0 THEN
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, 'หักเงินจอง', 'discount', 1,
            -v_contract.booking_deposit_applied, -v_contract.booking_deposit_applied, 3);
  END IF;

  -- subtract advance payment if any (capped at current invoice total)
  IF p_advance_payment > 0 THEN
    v_applied := LEAST(
      p_advance_payment,
      GREATEST(0, (SELECT total_amount FROM invoices WHERE id = v_invoice_id))
    );
    IF v_applied > 0 THEN
      INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
      VALUES (v_invoice_id, 'หักค่าทำสัญญาล่วงหน้า', 'discount', 1,
              -v_applied, -v_applied, 4);
    END IF;
  END IF;

  -- auto-close invoice if fully covered by advance
  IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
    UPDATE invoices SET status = 'paid', total_amount = 0 WHERE id = v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION generate_contract_initial_invoice(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_contract_initial_invoice(uuid, numeric) TO authenticated;


-- =====================================================================
-- 2. generate_prorated_first_invoice — accept optional advance deduction
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_prorated_first_invoice(
  p_contract_id     uuid,
  p_advance_payment numeric(12,2) DEFAULT 0
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
  v_applied        numeric(12,2);
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;

  v_move_in := COALESCE(v_contract.actual_move_in_at::date, v_contract.move_in_date);
  IF v_move_in IS NULL THEN RETURN NULL; END IF;
  IF extract(day FROM v_move_in) = 1 THEN RETURN NULL; END IF;

  v_month_end     := (date_trunc('month', v_move_in) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day FROM v_month_end)::int;
  v_days_charged  := v_days_in_month - extract(day FROM v_move_in)::int + 1;
  v_prorated      := ceil(v_contract.monthly_rent * v_days_charged / v_days_in_month);
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
          'rent', v_days_charged,
          round(v_contract.monthly_rent / v_days_in_month, 2),
          v_prorated, 1);

  -- prorated add-ons
  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id AND is_active = true AND billing_cycle = 'monthly'
  LOOP
    v_addon_prorated := ceil(v_addon.amount * v_days_charged / v_days_in_month);
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name || ' (prorated)', 'addon', v_days_charged,
            round(v_addon.amount / v_days_in_month, 2), v_addon_prorated, 10);
  END LOOP;

  -- subtract remaining advance payment if any (capped at current invoice total)
  IF p_advance_payment > 0 THEN
    v_applied := LEAST(
      p_advance_payment,
      GREATEST(0, (SELECT total_amount FROM invoices WHERE id = v_invoice_id))
    );
    IF v_applied > 0 THEN
      INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
      VALUES (v_invoice_id, 'หักค่าทำสัญญาล่วงหน้า', 'discount', 1,
              -v_applied, -v_applied, 20);
    END IF;
  END IF;

  -- auto-close invoice if fully covered by advance
  IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
    UPDATE invoices SET status = 'paid', total_amount = 0 WHERE id = v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION generate_prorated_first_invoice(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_prorated_first_invoice(uuid, numeric) TO authenticated;


-- =====================================================================
-- 3. approve_contract — auto-apply advance payments to invoices
-- =====================================================================
CREATE OR REPLACE FUNCTION approve_contract(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          contract_status;
  v_contract        contracts%rowtype;
  v_invoice_id      uuid;
  v_advance_total   numeric(12,2);
  v_initial_base    numeric(12,2);
  v_adv_initial     numeric(12,2);
  v_adv_prorate     numeric(12,2);
BEGIN
  SELECT status INTO v_status FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract not found';
  END IF;
  IF v_status != 'pending_approve' THEN
    RAISE EXCEPTION 'contract is not pending_approve (current: %)', v_status;
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;

  UPDATE contracts SET status = 'approved', updated_at = now() WHERE id = p_contract_id;

  -- Sum all advance payments recorded before approval
  SELECT COALESCE(SUM(amount), 0) INTO v_advance_total
  FROM contract_advance_payments
  WHERE contract_id = p_contract_id;

  -- Base of contract_initial invoice before advance deduction
  v_initial_base := v_contract.deposit_amount
                  + v_contract.advance_rent_amount
                  - COALESCE(v_contract.booking_deposit_applied, 0);

  -- Split advance: apply to initial invoice first, remainder to prorate
  v_adv_initial := LEAST(v_advance_total, GREATEST(0, v_initial_base));
  v_adv_prorate := GREATEST(0, v_advance_total - v_adv_initial);

  -- Create deposit + advance invoice (with advance deduction if any)
  v_invoice_id := generate_contract_initial_invoice(p_contract_id, v_adv_initial);

  -- Create prorated first-month rent invoice (with remaining advance if any)
  PERFORM generate_prorated_first_invoice(p_contract_id, v_adv_prorate);

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION approve_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_contract(uuid) TO authenticated;
