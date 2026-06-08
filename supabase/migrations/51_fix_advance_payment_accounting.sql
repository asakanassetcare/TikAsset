-- Migration 51: Fix advance payment flow — route through accounting instead of auto-closing
-- When invoice total reaches 0 from advance deduction, create a pending_approve payment record
-- so accounting can verify the slip before the invoice is marked paid.

CREATE OR REPLACE FUNCTION generate_contract_initial_invoice(
  p_contract_id     uuid,
  p_advance_payment numeric(12,2) DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract    contracts%rowtype;
  v_invoice_id  uuid;
  v_room_number text;
  v_applied     numeric(12,2) := 0;
  v_slip_url    text;
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_contract.room_id;

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

  IF COALESCE(v_contract.booking_deposit_applied, 0) > 0 THEN
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, 'หักเงินจอง', 'discount', 1,
            -v_contract.booking_deposit_applied, -v_contract.booking_deposit_applied, 3);
  END IF;

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

  -- If fully covered: create pending_approve payment record for accounting to verify
  -- (do NOT auto-mark paid — let accounting approve the slip first)
  IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
    UPDATE invoices SET total_amount = 0 WHERE id = v_invoice_id;

    SELECT slip_url INTO v_slip_url
    FROM contract_advance_payments
    WHERE contract_id = p_contract_id
    ORDER BY created_at DESC LIMIT 1;

    INSERT INTO payments(invoice_id, amount, paid_date, status, bank_reference, slip_url)
    VALUES (v_invoice_id, v_applied, current_date, 'pending_approve',
            'ค่าทำสัญญาล่วงหน้า', v_slip_url);
  END IF;

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION generate_contract_initial_invoice(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_contract_initial_invoice(uuid, numeric) TO authenticated;


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
  v_applied        numeric(12,2) := 0;
  v_slip_url       text;
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

  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id AND is_active = true AND billing_cycle = 'monthly'
  LOOP
    v_addon_prorated := ceil(v_addon.amount * v_days_charged / v_days_in_month);
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name || ' (prorated)', 'addon', v_days_charged,
            round(v_addon.amount / v_days_in_month, 2), v_addon_prorated, 10);
  END LOOP;

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

  -- If fully covered: route through accounting review
  IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
    UPDATE invoices SET total_amount = 0 WHERE id = v_invoice_id;

    SELECT slip_url INTO v_slip_url
    FROM contract_advance_payments
    WHERE contract_id = p_contract_id
    ORDER BY created_at DESC LIMIT 1;

    INSERT INTO payments(invoice_id, amount, paid_date, status, bank_reference, slip_url)
    VALUES (v_invoice_id, v_applied, current_date, 'pending_approve',
            'ค่าทำสัญญาล่วงหน้า', v_slip_url);
  END IF;

  RETURN v_invoice_id;
END
$$;

REVOKE ALL ON FUNCTION generate_prorated_first_invoice(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_prorated_first_invoice(uuid, numeric) TO authenticated;
