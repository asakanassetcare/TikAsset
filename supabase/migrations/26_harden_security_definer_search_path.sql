-- ============================================================================
-- Migration 26: Harden SECURITY DEFINER functions recreated in later phases
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_monthly_invoice(
  p_contract_id uuid,
  p_period text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  INSERT INTO invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  VALUES (v_invoice_id, 'ค่าเช่าห้อง ' ||
          (SELECT room_number FROM rooms WHERE id = v_contract.room_id) ||
          ' เดือน ' || p_period,
          'rent', 1, v_contract.monthly_rent, v_contract.monthly_rent, 1);

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
END
$$;

CREATE OR REPLACE FUNCTION on_contract_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number text;
  v_is_short    boolean;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms WHERE id = new.room_id;
  v_is_short := new.contract_end_date < new.contract_start_date + interval '1 year';

  IF tg_op = 'INSERT' AND new.status = 'pending_approve' THEN
    PERFORM notify_role('executive', 'contract_pending_approve',
      'สัญญารออนุมัติ: ' || new.contract_number,
      'ห้อง ' || v_room_number,
      'contracts', new.id, null);

    IF v_is_short THEN
      PERFORM notify_role('super_admin', 'contract_pending_approve',
        'สัญญาระยะสั้น รออนุมัติ: ' || new.contract_number,
        'สัญญาน้อยกว่า 1 ปี · ห้อง ' || v_room_number,
        'contracts', new.id, null);
    END IF;
  END IF;

  IF tg_op = 'UPDATE' AND new.status IS DISTINCT FROM old.status THEN
    IF new.status = 'pending_approve' AND old.status != 'pending_approve' THEN
      PERFORM notify_role('executive', 'contract_pending_approve',
        'สัญญารออนุมัติ: ' || new.contract_number,
        'ห้อง ' || v_room_number,
        'contracts', new.id, null);

      IF v_is_short THEN
        PERFORM notify_role('super_admin', 'contract_pending_approve',
          'สัญญาระยะสั้น รออนุมัติ: ' || new.contract_number,
          'สัญญาน้อยกว่า 1 ปี · ห้อง ' || v_room_number,
          'contracts', new.id, null);
      END IF;
    END IF;

    IF new.status = 'approved' THEN
      PERFORM notify_user(new.assigned_staff_id, 'contract_approved',
        'สัญญา ' || new.contract_number || ' อนุมัติแล้ว', null,
        'contracts', new.id, null);
    END IF;

    IF new.status = 'rejected' THEN
      PERFORM notify_user(new.assigned_staff_id, 'contract_rejected',
        'สัญญา ' || new.contract_number || ' ถูกปฏิเสธ',
        new.rejection_reason, 'contracts', new.id, null);
    END IF;
  END IF;

  RETURN new;
END
$$;
