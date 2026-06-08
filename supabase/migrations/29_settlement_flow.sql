-- Migration 29: Settlement flow redesign
--
-- New flow:
--   refund_to_tenant : pending → accounting confirms directly → completed
--   charge_from_tenant: pending → staff records receipt (paid_by_staff) → accounting confirms → completed
--   zero balance     : create settlement amount=0/refund_to_tenant → accounting confirms → completed
--                      (previously zero went straight to settled, bypassing accounting)

-- 1. Trigger: zero-balance now creates a settlement instead of immediately settling
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
    SELECT * INTO v_contract FROM contracts WHERE id = new.contract_id;
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

    UPDATE rooms SET status = 'available' WHERE id = new.room_id;

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

-- 2. confirm_settlement_completed: accounting can now confirm from:
--    - pending   (for refund_to_tenant and zero)
--    - paid_by_staff (for charge_from_tenant after staff collected)
CREATE OR REPLACE FUNCTION confirm_settlement_completed(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct_id   uuid;
  v_mo_id     uuid;
  v_direction text;
  v_status    text;
BEGIN
  SELECT id INTO v_acct_id
  FROM profiles
  WHERE id = auth.uid()
    AND role IN ('accounting', 'super_admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT move_out_id, direction, status
  INTO v_mo_id, v_direction, v_status
  FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  IF v_direction = 'charge_from_tenant' AND v_status = 'pending' THEN
    RAISE EXCEPTION 'Staff must record receipt from tenant before accounting can confirm';
  END IF;

  IF v_status NOT IN ('pending', 'paid_by_staff') THEN
    RAISE EXCEPTION 'Settlement cannot be confirmed in current state: %', v_status;
  END IF;

  UPDATE settlements SET
    status       = 'completed',
    confirmed_by = v_acct_id,
    confirmed_at = now()
  WHERE id = p_settlement_id;

  UPDATE move_outs SET status = 'settled' WHERE id = v_mo_id;
END
$$;

REVOKE ALL ON FUNCTION confirm_settlement_completed(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_settlement_completed(uuid) TO authenticated;
