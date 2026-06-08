-- Migration 78: create the first-month rent invoice even when a contract
-- starts on the first day of the month.
--
-- The monthly cron only runs on day 1. If a contract is created/approved after
-- that cron run but its contract_start_date is day 1, the previous
-- generate_prorated_first_invoice returned NULL and no June/first-month rent
-- invoice was created.

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
  v_start          date;
  v_month_end      date;
  v_days_charged   int;
  v_rent_amount    numeric(12,2);
  v_period         text;
  v_due_date       date;
  v_addon          record;
  v_addon_amount   numeric(12,2);
  v_applied        numeric(12,2) := 0;
  v_slip_url       text;
  v_advance        rent_advance_payments%rowtype;
  v_inv_total      numeric(12,2);
  v_rent_applied   numeric(12,2);
BEGIN
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Billing uses contract_start_date. actual_move_in_at is staff reference.
  v_start := v_contract.contract_start_date;
  IF v_start IS NULL THEN RETURN NULL; END IF;

  v_month_end := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  v_period    := to_char(v_start, 'YYYY-MM');
  v_due_date  := v_start;

  IF EXISTS (
    SELECT 1
    FROM invoices
    WHERE contract_id = p_contract_id
      AND billing_period = v_period
      AND invoice_type = 'monthly_rent'
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NULL;
  END IF;

  IF extract(day FROM v_start) = 1 THEN
    v_days_charged := 30;
    v_rent_amount  := v_contract.monthly_rent;
  ELSE
    v_days_charged := v_month_end - v_start + 1;
    v_rent_amount  := ceil(v_contract.monthly_rent * v_days_charged / 30.0);
  END IF;

  INSERT INTO invoices(
    invoice_type, contract_id, tenant_id, room_id,
    billing_period, issue_date, due_date, status, note
  )
  VALUES (
    'monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
    v_period, current_date, v_due_date, 'pending',
    CASE
      WHEN extract(day FROM v_start) = 1 THEN 'First month rent ' || v_period
      ELSE format('Prorated first-month rent %s-%s', to_char(v_start, 'DD/MM'), to_char(v_month_end, 'DD/MM'))
    END
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (
    v_invoice_id,
    CASE
      WHEN extract(day FROM v_start) = 1 THEN
        'Room rent ' || COALESCE((SELECT room_number FROM rooms WHERE id = v_contract.room_id), '') || ' month ' || v_period
      ELSE
        format('Prorated rent %s days (%s-%s)', v_days_charged, to_char(v_start, 'DD/MM/YYYY'), to_char(v_month_end, 'DD/MM/YYYY'))
    END,
    'rent',
    CASE WHEN extract(day FROM v_start) = 1 THEN 1 ELSE v_days_charged END,
    CASE WHEN extract(day FROM v_start) = 1 THEN v_rent_amount ELSE round(v_contract.monthly_rent / 30.0, 2) END,
    v_rent_amount,
    1
  );

  FOR v_addon IN
    SELECT *
    FROM contract_addons
    WHERE contract_id = p_contract_id
      AND is_active = true
      AND billing_cycle = 'monthly'
      AND (start_date IS NULL OR start_date <= v_month_end)
      AND (end_date   IS NULL OR end_date   >= v_start)
  LOOP
    v_addon_amount := CASE
      WHEN extract(day FROM v_start) = 1 THEN v_addon.amount
      ELSE ceil(v_addon.amount * v_days_charged / 30.0)
    END;

    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (
      v_invoice_id,
      CASE WHEN extract(day FROM v_start) = 1 THEN v_addon.name ELSE v_addon.name || ' (prorated)' END,
      'addon',
      CASE WHEN extract(day FROM v_start) = 1 THEN 1 ELSE v_days_charged END,
      CASE WHEN extract(day FROM v_start) = 1 THEN v_addon.amount ELSE round(v_addon.amount / 30.0, 2) END,
      v_addon_amount,
      10
    );
  END LOOP;

  -- Apply contract advance recorded before approval.
  IF p_advance_payment > 0 THEN
    v_applied := LEAST(
      p_advance_payment,
      GREATEST(0, (SELECT total_amount FROM invoices WHERE id = v_invoice_id))
    );

    IF v_applied > 0 THEN
      INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
      VALUES (v_invoice_id, 'Deduct contract advance payment', 'discount', 1, -v_applied, -v_applied, 20);
    END IF;
  END IF;

  IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
    UPDATE invoices SET total_amount = 0 WHERE id = v_invoice_id;

    SELECT slip_url INTO v_slip_url
    FROM contract_advance_payments
    WHERE contract_id = p_contract_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_applied > 0 THEN
      INSERT INTO payments(invoice_id, amount, paid_date, status, bank_reference, slip_url, recorded_by)
      VALUES (
        v_invoice_id, v_applied, current_date, 'pending_approve',
        'Contract advance payment', v_slip_url, auth.uid()
      );
    END IF;
  END IF;

  -- Apply active rent advance if this invoice was created after the advance was recorded.
  SELECT * INTO v_advance
  FROM rent_advance_payments
  WHERE contract_id = p_contract_id
    AND status = 'active'
    AND remaining_amount > 0
  ORDER BY created_at
  LIMIT 1;

  IF v_advance.id IS NOT NULL THEN
    SELECT total_amount INTO v_inv_total FROM invoices WHERE id = v_invoice_id;
    v_rent_applied := LEAST(v_advance.remaining_amount, GREATEST(0, v_inv_total));

    IF v_rent_applied > 0 THEN
      INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
      VALUES (
        v_invoice_id,
        format('Deduct rent advance (%s)', v_advance.advance_number),
        'discount', 1, -v_rent_applied, -v_rent_applied, 100
      );

      UPDATE rent_advance_payments
      SET remaining_amount = remaining_amount - v_rent_applied,
          status = CASE
                     WHEN remaining_amount - v_rent_applied <= 0 THEN 'fully_used'
                     ELSE 'active'
                   END
      WHERE id = v_advance.id;

      IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
        UPDATE invoices SET status = 'paid', total_amount = 0 WHERE id = v_invoice_id;
      END IF;
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION generate_prorated_first_invoice(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_prorated_first_invoice(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION generate_prorated_first_invoice(
  p_contract_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN generate_prorated_first_invoice(p_contract_id, 0);
END;
$$;

REVOKE ALL ON FUNCTION generate_prorated_first_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_prorated_first_invoice(uuid) TO authenticated;

-- Backfill active/approved contracts whose first billing period was missed.
DO $$
DECLARE
  v_contract record;
BEGIN
  FOR v_contract IN
    SELECT c.id
    FROM contracts c
    WHERE c.status IN ('approved', 'active')
      AND c.contract_start_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM invoices i
        WHERE i.contract_id = c.id
          AND i.invoice_type = 'monthly_rent'
          AND i.billing_period = to_char(c.contract_start_date, 'YYYY-MM')
          AND i.status NOT IN ('cancelled', 'rejected')
      )
  LOOP
    PERFORM generate_prorated_first_invoice(v_contract.id, 0);
  END LOOP;
END;
$$;
