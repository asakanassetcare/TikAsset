CREATE OR REPLACE FUNCTION on_move_out_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract  contracts%rowtype;
  v_direction text;
  v_amount    numeric(12,2);
  v_today     date := (current_timestamp AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  IF new.status = 'approved' AND (old.status IS NULL OR old.status <> 'approved') THEN
    SELECT * INTO v_contract FROM contracts WHERE id = new.contract_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contract not found for move-out %', new.id;
    END IF;

    IF new.move_out_date::date <= v_today THEN
      UPDATE contracts SET
        actual_move_out_at = new.move_out_date::timestamptz,
        status             = (CASE WHEN new.is_early_termination THEN 'terminated' ELSE 'expired' END)::contract_status,
        terminated_at      = CASE WHEN new.is_early_termination THEN now() ELSE null END,
        termination_reason = new.reason,
        electric_meter_end = new.electric_meter_end,
        water_meter_end    = new.water_meter_end
      WHERE id = new.contract_id;

      UPDATE rooms SET status = 'available' WHERE id = new.room_id;
    END IF;

    IF new.refund_amount > 0 THEN
      v_direction := 'refund_to_tenant';
      v_amount    := new.refund_amount;
    ELSIF new.additional_charge > 0 THEN
      v_direction := 'charge_from_tenant';
      v_amount    := new.additional_charge;
    ELSE
      v_direction := 'refund_to_tenant';
      v_amount    := 0;
    END IF;

    INSERT INTO settlements(move_out_id, amount, direction, status)
    VALUES (new.id, v_amount, v_direction, 'pending')
    ON CONFLICT (move_out_id) DO UPDATE
       SET amount    = CASE
                         WHEN settlements.status IN ('pending', 'rejected') THEN excluded.amount
                         ELSE settlements.amount
                       END,
           direction = CASE
                         WHEN settlements.status IN ('pending', 'rejected') THEN excluded.direction
                         ELSE settlements.direction
                       END,
           status    = CASE
                         WHEN settlements.status IN ('pending', 'rejected') THEN 'pending'
                         ELSE settlements.status
                       END;

    PERFORM notify_user(
      v_contract.assigned_staff_id,
      'move_out_pending',
      'Move-out approved: ' || new.move_out_number,
      CASE
        WHEN v_amount = 0 THEN 'Zero balance — accounting review required.'
        ELSE 'Settlement deadline: ' || to_char(new.settlement_deadline, 'DD/MM/YYYY')
      END,
      'move_outs',
      new.id,
      null
    );
  END IF;

  RETURN new;
END
$$;

CREATE OR REPLACE FUNCTION on_move_out_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'pending_accounting'
     AND (old.status IS NULL OR old.status <> 'pending_accounting')
     AND new.move_out_date::date <= (current_timestamp AT TIME ZONE 'Asia/Bangkok')::date
  THEN
    UPDATE rooms SET status = 'available' WHERE id = new.room_id;
  END IF;
  RETURN new;
END
$$;

CREATE OR REPLACE FUNCTION process_due_move_outs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo    move_outs%rowtype;
  v_today date := (current_timestamp AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  FOR v_mo IN
    SELECT mo.*
    FROM move_outs mo
    JOIN contracts c ON c.id = mo.contract_id
    WHERE mo.status = 'approved'
      AND mo.move_out_date::date <= v_today
      AND c.status = 'active'
  LOOP
    UPDATE contracts SET
      status             = (CASE WHEN v_mo.is_early_termination THEN 'terminated' ELSE 'expired' END)::contract_status,
      terminated_at      = CASE WHEN v_mo.is_early_termination THEN now() ELSE null END,
      actual_move_out_at = v_mo.move_out_date::timestamptz,
      termination_reason = v_mo.reason,
      electric_meter_end = v_mo.electric_meter_end,
      water_meter_end    = v_mo.water_meter_end
    WHERE id = v_mo.contract_id;

    UPDATE rooms SET status = 'available'
    WHERE id = v_mo.room_id AND status = 'occupied';
  END LOOP;
END;
$$;
