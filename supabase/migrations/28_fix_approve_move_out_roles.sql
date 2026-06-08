-- Migration 28: Fix approve_move_out
--   1. Cast CASE expression to contract_status enum in trigger (prevents "of type text" error)
--   2. Change approver role from accounting → head_staff

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
BEGIN
  IF new.status = 'approved' AND (old.status IS NULL OR old.status <> 'approved') THEN
    SELECT *
      INTO v_contract
      FROM contracts
     WHERE id = new.contract_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contract not found for move-out %', new.id;
    END IF;

    UPDATE contracts
       SET actual_move_out_at = new.move_out_date::timestamptz,
           status             = (CASE WHEN new.is_early_termination THEN 'terminated' ELSE 'expired' END)::contract_status,
           terminated_at      = CASE WHEN new.is_early_termination THEN now() ELSE null END,
           termination_reason = new.reason,
           electric_meter_end = new.electric_meter_end,
           water_meter_end    = new.water_meter_end
     WHERE id = new.contract_id;

    UPDATE rooms
       SET status = 'available'
     WHERE id = new.room_id;

    IF new.refund_amount > 0 THEN
      v_direction := 'refund_to_tenant';
      v_amount    := new.refund_amount;
    ELSIF new.additional_charge > 0 THEN
      v_direction := 'charge_from_tenant';
      v_amount    := new.additional_charge;
    ELSE
      UPDATE move_outs
         SET status = 'settled'
       WHERE id = new.id
         AND status = 'approved';

      PERFORM notify_user(
        v_contract.assigned_staff_id,
        'move_out_pending',
        'Move-out approved: ' || new.move_out_number,
        'No settlement is required.',
        'move_outs',
        new.id,
        null
      );

      RETURN new;
    END IF;

    INSERT INTO settlements(move_out_id, amount, direction, status)
    VALUES (new.id, v_amount, v_direction, 'pending')
    ON CONFLICT (move_out_id) DO UPDATE
       SET amount    = excluded.amount,
           direction = excluded.direction,
           status    = CASE
                         WHEN settlements.status = 'pending' THEN excluded.status
                         ELSE settlements.status
                       END;

    PERFORM notify_user(
      v_contract.assigned_staff_id,
      'move_out_pending',
      'Move-out approved: ' || new.move_out_number,
      'Settlement deadline: ' || to_char(new.settlement_deadline, 'DD/MM/YYYY'),
      'move_outs',
      new.id,
      null
    );
  END IF;

  RETURN new;
END
$$;

-- Approver is now head_staff (not accounting)
CREATE OR REPLACE FUNCTION approve_move_out(p_move_out_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_id uuid;
  v_status      move_out_status;
BEGIN
  SELECT id
    INTO v_approver_id
    FROM profiles
   WHERE id = auth.uid()
     AND role IN ('head_staff', 'super_admin');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT status
    INTO v_status
    FROM move_outs
   WHERE id = p_move_out_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Move-out record not found';
  END IF;

  IF v_status <> 'pending_accounting' THEN
    RAISE EXCEPTION 'Move-out is already % - cannot approve again', v_status;
  END IF;

  UPDATE move_outs
     SET status      = 'approved',
         approved_by = v_approver_id,
         approved_at = now()
   WHERE id = p_move_out_id;
END
$$;

REVOKE ALL ON FUNCTION approve_move_out(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_move_out(uuid) TO authenticated;
