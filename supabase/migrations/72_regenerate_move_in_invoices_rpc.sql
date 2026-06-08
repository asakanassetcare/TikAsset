-- Migration 72: regenerate move-in invoices transactionally.
-- Keeps contract update, invoice replacement, item recreation, and advance
-- payment review records in one database transaction.

CREATE OR REPLACE FUNCTION regenerate_move_in_invoices(
  p_contract_id uuid,
  p_contract_start_date date,
  p_move_in_date date,
  p_monthly_rent numeric,
  p_deposit_amount numeric DEFAULT 0,
  p_advance_rent_amount numeric DEFAULT 0,
  p_booking_deposit_applied numeric DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts%rowtype;
  v_room_number text;
  v_billing_period text;
  v_month_end date;
  v_days_charged int := 0;

  v_advance_paid numeric(12,2) := 0;
  v_initial_base numeric(12,2) := 0;
  v_initial_advance numeric(12,2) := 0;
  v_initial_total numeric(12,2) := 0;
  v_prorate_base numeric(12,2) := 0;
  v_prorate_advance numeric(12,2) := 0;
  v_prorate_total numeric(12,2) := 0;

  v_pending_count int := 0;
  v_invoice_id uuid;
  v_initial_invoice_id uuid;
  v_prorate_invoice_id uuid;
  v_invoice_status invoice_status;
  v_slip_url text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF current_user_role() NOT IN ('super_admin', 'head_staff') THEN
    RAISE EXCEPTION 'Only head staff can regenerate move-in invoices';
  END IF;

  IF p_contract_start_date IS NULL OR p_move_in_date IS NULL THEN
    RAISE EXCEPTION 'Contract start date and move-in date are required';
  END IF;

  IF p_monthly_rent IS NULL OR p_monthly_rent <= 0 THEN
    RAISE EXCEPTION 'Monthly rent must be greater than zero';
  END IF;

  IF COALESCE(p_deposit_amount, 0) < 0
     OR COALESCE(p_advance_rent_amount, 0) < 0
     OR COALESCE(p_booking_deposit_applied, 0) < 0 THEN
    RAISE EXCEPTION 'Money amounts cannot be negative';
  END IF;

  SELECT *
    INTO v_contract
    FROM contracts
   WHERE id = p_contract_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF v_contract.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved contracts before move-in can regenerate move-in invoices';
  END IF;

  SELECT COUNT(*)
    INTO v_pending_count
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
   WHERE i.contract_id = p_contract_id
     AND i.invoice_type IN ('contract_initial', 'monthly_rent')
     AND p.status = 'pending_approve';

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'Move-in invoice has a payment pending accounting approval';
  END IF;

  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_contract.room_id;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_advance_paid
    FROM contract_advance_payments
   WHERE contract_id = p_contract_id;

  v_initial_base := GREATEST(
    0,
    COALESCE(p_deposit_amount, 0)
      + COALESCE(p_advance_rent_amount, 0)
      - COALESCE(p_booking_deposit_applied, 0)
  );
  v_initial_advance := LEAST(v_advance_paid, v_initial_base);
  v_initial_total := GREATEST(0, v_initial_base - v_initial_advance);

  IF EXTRACT(day FROM p_contract_start_date) = 1 THEN
    v_prorate_base := 0;
  ELSE
    v_month_end := (date_trunc('month', p_contract_start_date) + interval '1 month - 1 day')::date;
    v_days_charged := EXTRACT(day FROM v_month_end)::int
      - EXTRACT(day FROM p_contract_start_date)::int
      + 1;
    v_prorate_base := CEIL(p_monthly_rent * v_days_charged / 30.0);
  END IF;
  v_prorate_advance := LEAST(GREATEST(0, v_advance_paid - v_initial_advance), v_prorate_base);
  v_prorate_total := GREATEST(0, v_prorate_base - v_prorate_advance);
  v_billing_period := to_char(p_contract_start_date, 'YYYY-MM');

  UPDATE contracts
     SET contract_start_date = p_contract_start_date,
         move_in_date = p_move_in_date,
         monthly_rent = p_monthly_rent,
         deposit_amount = COALESCE(p_deposit_amount, 0),
         advance_rent_amount = COALESCE(p_advance_rent_amount, 0),
         booking_deposit_applied = COALESCE(p_booking_deposit_applied, 0),
         updated_at = now()
   WHERE id = p_contract_id;

  -- contract_initial invoice
  SELECT id, status
    INTO v_invoice_id, v_invoice_status
    FROM invoices
   WHERE contract_id = p_contract_id
     AND invoice_type = 'contract_initial'
     AND billing_period IS NULL
   ORDER BY CASE WHEN status NOT IN ('cancelled', 'rejected') THEN 0 ELSE 1 END, created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_invoice_status IS DISTINCT FROM 'paid' THEN
    IF v_initial_total <= 0
       AND COALESCE(p_deposit_amount, 0) = 0
       AND COALESCE(p_advance_rent_amount, 0) = 0
       AND COALESCE(p_booking_deposit_applied, 0) = 0
       AND v_initial_advance <= 0 THEN
      IF v_invoice_id IS NOT NULL THEN
        UPDATE invoices
           SET status = 'cancelled',
               cancelled_at = COALESCE(cancelled_at, now()),
               cancelled_by = COALESCE(cancelled_by, auth.uid()),
               cancellation_reason = COALESCE(NULLIF(TRIM(p_note), ''), 'Regenerated with zero amount')
         WHERE id = v_invoice_id;
      END IF;
    ELSE
      IF v_invoice_id IS NULL THEN
        INSERT INTO invoices(
          invoice_type, contract_id, tenant_id, room_id, billing_period,
          issue_date, due_date, status, note
        ) VALUES (
          'contract_initial', p_contract_id, v_contract.tenant_id, v_contract.room_id, NULL,
          current_date, p_move_in_date,
          CASE
            WHEN v_initial_total <= 0 AND v_initial_advance > 0 THEN 'paid_pending_approve'::invoice_status
            WHEN v_initial_total <= 0 THEN 'paid'::invoice_status
            ELSE 'pending'::invoice_status
          END,
          NULLIF(TRIM(p_note), '')
        )
        RETURNING id INTO v_invoice_id;
      ELSE
        UPDATE invoices
           SET tenant_id = v_contract.tenant_id,
               room_id = v_contract.room_id,
               billing_period = NULL,
               issue_date = current_date,
               due_date = p_move_in_date,
               status = CASE
                 WHEN v_initial_total <= 0 AND v_initial_advance > 0 THEN 'paid_pending_approve'::invoice_status
                 WHEN v_initial_total <= 0 THEN 'paid'::invoice_status
                 ELSE 'pending'::invoice_status
               END,
               cancelled_at = NULL,
               cancelled_by = NULL,
               cancellation_reason = NULL,
               note = NULLIF(TRIM(p_note), '')
         WHERE id = v_invoice_id;

        DELETE FROM invoice_items WHERE invoice_id = v_invoice_id;
      END IF;

      IF COALESCE(p_deposit_amount, 0) <> 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id, 'เงินประกัน ห้อง ' || COALESCE(v_room_number, ''), 'deposit', 1,
                COALESCE(p_deposit_amount, 0), COALESCE(p_deposit_amount, 0), 1);
      END IF;

      IF COALESCE(p_advance_rent_amount, 0) <> 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id, 'ค่าเช่าล่วงหน้า', 'advance', 1,
                COALESCE(p_advance_rent_amount, 0), COALESCE(p_advance_rent_amount, 0), 2);
      END IF;

      IF COALESCE(p_booking_deposit_applied, 0) <> 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id, 'หักเงินจอง', 'discount', 1,
                -COALESCE(p_booking_deposit_applied, 0), -COALESCE(p_booking_deposit_applied, 0), 3);
      END IF;

      IF v_initial_advance > 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id, 'หักค่าทำสัญญาล่วงหน้า', 'discount', 1,
                -v_initial_advance, -v_initial_advance, 4);

        IF v_initial_total <= 0 THEN
          SELECT slip_url
            INTO v_slip_url
            FROM contract_advance_payments
           WHERE contract_id = p_contract_id
             AND slip_url IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1;

          INSERT INTO payments(invoice_id, amount, paid_date, status, bank_reference, slip_url, note, recorded_by)
          VALUES (v_invoice_id, v_initial_advance, current_date, 'pending_approve',
                  'ค่าทำสัญญาล่วงหน้า', v_slip_url, NULLIF(TRIM(p_note), ''), auth.uid());
        END IF;
      END IF;
    END IF;
  END IF;
  v_initial_invoice_id := v_invoice_id;

  -- first prorated monthly_rent invoice
  v_invoice_id := NULL;
  v_invoice_status := NULL;

  SELECT id, status
    INTO v_invoice_id, v_invoice_status
    FROM invoices
   WHERE contract_id = p_contract_id
     AND invoice_type = 'monthly_rent'
     AND billing_period = v_billing_period
   ORDER BY CASE WHEN status NOT IN ('cancelled', 'rejected') THEN 0 ELSE 1 END, created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_invoice_id IS NULL THEN
    SELECT id, status
      INTO v_invoice_id, v_invoice_status
      FROM invoices
     WHERE contract_id = p_contract_id
       AND invoice_type = 'monthly_rent'
       AND status <> 'paid'
     ORDER BY CASE WHEN status NOT IN ('cancelled', 'rejected') THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_invoice_status IS DISTINCT FROM 'paid' THEN
    IF v_prorate_base <= 0 AND v_prorate_advance <= 0 THEN
      IF v_invoice_id IS NOT NULL THEN
        UPDATE invoices
           SET status = 'cancelled',
               cancelled_at = COALESCE(cancelled_at, now()),
               cancelled_by = COALESCE(cancelled_by, auth.uid()),
               cancellation_reason = COALESCE(NULLIF(TRIM(p_note), ''), 'Regenerated with no prorated rent')
         WHERE id = v_invoice_id;
      END IF;
    ELSE
      IF v_invoice_id IS NULL THEN
        INSERT INTO invoices(
          invoice_type, contract_id, tenant_id, room_id, billing_period,
          issue_date, due_date, status, note
        ) VALUES (
          'monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id, v_billing_period,
          current_date, p_move_in_date,
          CASE
            WHEN v_prorate_total <= 0 AND v_prorate_advance > 0 THEN 'paid_pending_approve'::invoice_status
            WHEN v_prorate_total <= 0 THEN 'paid'::invoice_status
            ELSE 'pending'::invoice_status
          END,
          'ค่าเช่า prorated ' || v_billing_period
        )
        RETURNING id INTO v_invoice_id;
      ELSE
        UPDATE invoices
           SET tenant_id = v_contract.tenant_id,
               room_id = v_contract.room_id,
               billing_period = v_billing_period,
               issue_date = current_date,
               due_date = p_move_in_date,
               status = CASE
                 WHEN v_prorate_total <= 0 AND v_prorate_advance > 0 THEN 'paid_pending_approve'::invoice_status
                 WHEN v_prorate_total <= 0 THEN 'paid'::invoice_status
                 ELSE 'pending'::invoice_status
               END,
               cancelled_at = NULL,
               cancelled_by = NULL,
               cancellation_reason = NULL,
               note = 'ค่าเช่า prorated ' || v_billing_period
         WHERE id = v_invoice_id;

        DELETE FROM invoice_items WHERE invoice_id = v_invoice_id;
      END IF;

      IF v_prorate_base > 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id,
                format('ค่าเช่า prorated %s วัน (%s-%s)', v_days_charged,
                       to_char(p_contract_start_date, 'DD/MM/YYYY'), to_char(v_month_end, 'DD/MM/YYYY')),
                'rent', v_days_charged, round(p_monthly_rent / 30.0, 2), v_prorate_base, 1);
      END IF;

      IF v_prorate_advance > 0 THEN
        INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
        VALUES (v_invoice_id, 'หักค่าทำสัญญาล่วงหน้า', 'discount', 1,
                -v_prorate_advance, -v_prorate_advance, 20);

        IF v_prorate_total <= 0 THEN
          SELECT slip_url
            INTO v_slip_url
            FROM contract_advance_payments
           WHERE contract_id = p_contract_id
             AND slip_url IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1;

          INSERT INTO payments(invoice_id, amount, paid_date, status, bank_reference, slip_url, note, recorded_by)
          VALUES (v_invoice_id, v_prorate_advance, current_date, 'pending_approve',
                  'ค่าทำสัญญาล่วงหน้า', v_slip_url, NULLIF(TRIM(p_note), ''), auth.uid());
        END IF;
      END IF;
    END IF;
  END IF;
  v_prorate_invoice_id := v_invoice_id;

  UPDATE invoices
     SET status = 'cancelled',
         cancelled_at = COALESCE(cancelled_at, now()),
         cancelled_by = COALESCE(cancelled_by, auth.uid()),
         cancellation_reason = COALESCE(cancellation_reason, 'Superseded by regenerated move-in invoice')
   WHERE contract_id = p_contract_id
     AND invoice_type = 'contract_initial'
     AND status <> 'paid'
     AND (v_initial_invoice_id IS NULL OR id <> v_initial_invoice_id);

  UPDATE invoices
     SET status = 'cancelled',
         cancelled_at = COALESCE(cancelled_at, now()),
         cancelled_by = COALESCE(cancelled_by, auth.uid()),
         cancellation_reason = COALESCE(cancellation_reason, 'Superseded by regenerated move-in invoice')
   WHERE contract_id = p_contract_id
     AND invoice_type = 'monthly_rent'
     AND status <> 'paid'
     AND (v_prorate_invoice_id IS NULL OR id <> v_prorate_invoice_id);
END
$$;

REVOKE ALL ON FUNCTION regenerate_move_in_invoices(
  uuid, date, date, numeric, numeric, numeric, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION regenerate_move_in_invoices(
  uuid, date, date, numeric, numeric, numeric, numeric, text
) TO authenticated;
