-- Migration 68: Prorate rent for the last month of a contract
-- If contract_end_date falls before the end of the billing month,
-- charge rent for days 1–end only: ceil(monthly_rent × days / 30).
-- Addons are still charged in full (no proration).

CREATE OR REPLACE FUNCTION generate_monthly_invoice(
  p_contract_id uuid,
  p_period      text   -- 'YYYY-MM'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract     contracts%rowtype;
  v_invoice_id   uuid;
  v_period_start date;
  v_period_end   date;
  v_due_date     date;
  v_addon        record;
  v_advance      rent_advance_payments%rowtype;
  v_inv_total    numeric(12,2);
  v_applied      numeric(12,2);
  v_days_charged integer;
  v_rent_amount  numeric(12,2);
  v_rent_desc    text;
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
  IF v_period_end   < v_contract.contract_start_date THEN RETURN NULL; END IF;

  v_due_date := (v_period_start + (v_contract.payment_day - 1) * interval '1 day')::date;

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE contract_id = p_contract_id
      AND billing_period = p_period
      AND invoice_type   = 'monthly_rent'
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NULL;
  END IF;

  -- ── Compute rent amount (prorate if last month) ───────────────────────────
  IF v_contract.contract_end_date < v_period_end THEN
    v_days_charged := v_contract.contract_end_date - v_period_start + 1;
    v_rent_amount  := ceil(v_contract.monthly_rent * v_days_charged / 30.0);
    v_rent_desc    := format('ค่าเช่าห้อง %s (1–%s %s วัน)',
                       (SELECT room_number FROM rooms WHERE id = v_contract.room_id),
                       to_char(v_contract.contract_end_date, 'DD Mon YYYY'),
                       v_days_charged);
  ELSE
    v_rent_amount := v_contract.monthly_rent;
    v_rent_desc   := 'ค่าเช่าห้อง ' ||
                     (SELECT room_number FROM rooms WHERE id = v_contract.room_id) ||
                     ' เดือน ' || p_period;
  END IF;
  -- ─────────────────────────────────────────────────────────────────────────

  INSERT INTO invoices(invoice_type, contract_id, tenant_id, room_id,
                       billing_period, issue_date, due_date, status, note)
  VALUES ('monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          p_period, current_date, v_due_date, 'pending',
          'ค่าเช่ารายเดือน ' || p_period)
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (v_invoice_id, v_rent_desc, 'rent', 1, v_rent_amount, v_rent_amount, 1);

  FOR v_addon IN
    SELECT * FROM contract_addons
    WHERE contract_id = p_contract_id
      AND is_active = true
      AND billing_cycle = 'monthly'
      AND (start_date IS NULL OR start_date <= v_period_end)
      AND (end_date   IS NULL OR end_date   >= v_period_start)
  LOOP
    INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    VALUES (v_invoice_id, v_addon.name, 'addon', 1, v_addon.amount, v_addon.amount, 10);
  END LOOP;

  -- ── Auto-apply rent advance balance ──────────────────────────────────────
  SELECT * INTO v_advance
  FROM rent_advance_payments
  WHERE contract_id    = p_contract_id
    AND status         = 'active'
    AND remaining_amount > 0
  ORDER BY created_at
  LIMIT 1;

  IF v_advance.id IS NOT NULL THEN
    SELECT total_amount INTO v_inv_total FROM invoices WHERE id = v_invoice_id;
    v_applied := LEAST(v_advance.remaining_amount, v_inv_total);

    IF v_applied > 0 THEN
      INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
      VALUES (v_invoice_id,
              format('หักจากดาวน์ล่วงหน้า (%s)', v_advance.advance_number),
              'discount', 1, -v_applied, -v_applied, 100);

      UPDATE rent_advance_payments
      SET remaining_amount = remaining_amount - v_applied,
          status = CASE
                     WHEN remaining_amount - v_applied <= 0 THEN 'fully_used'
                     ELSE 'active'
                   END
      WHERE id = v_advance.id;

      IF (SELECT total_amount FROM invoices WHERE id = v_invoice_id) <= 0 THEN
        UPDATE invoices SET status = 'paid', total_amount = 0 WHERE id = v_invoice_id;
      END IF;
    END IF;
  END IF;
  -- ─────────────────────────────────────────────────────────────────────────

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION generate_monthly_invoice(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION generate_monthly_invoice(uuid, text) TO authenticated;
