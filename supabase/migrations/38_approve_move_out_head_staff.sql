-- Migration 38: Fix approve_move_out
-- 1. Role: head_staff (not accounting) approves
-- 2. Idempotent settlement insert (ON CONFLICT DO NOTHING) to survive retries

CREATE OR REPLACE FUNCTION approve_move_out(p_move_out_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo            move_outs%rowtype;
  v_approver_id   uuid;
  v_direction     text;
  v_amount        numeric(12,2);
BEGIN
  -- Role check: head_staff or super_admin
  SELECT id INTO v_approver_id
  FROM profiles
  WHERE id = auth.uid()
    AND role IN ('head_staff', 'super_admin');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_mo FROM move_outs WHERE id = p_move_out_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Move-out record not found';
  END IF;
  IF v_mo.status <> 'pending_accounting' THEN
    RAISE EXCEPTION 'Move-out is already % — cannot approve again', v_mo.status;
  END IF;

  -- 1. Approve the move-out
  UPDATE move_outs SET
    status      = 'approved',
    approved_by = v_approver_id,
    approved_at = now()
  WHERE id = p_move_out_id;

  -- 2. Terminate the contract
  UPDATE contracts SET
    status             = 'terminated',
    terminated_at      = now(),
    actual_move_out_at = v_mo.move_out_date::timestamptz,
    electric_meter_end = v_mo.electric_meter_end,
    water_meter_end    = v_mo.water_meter_end
  WHERE id = v_mo.contract_id;

  -- 3. Free the room
  UPDATE rooms SET status = 'available'
  WHERE id = v_mo.room_id;

  -- 4. Create settlement (idempotent — skip if already exists)
  IF v_mo.refund_amount > 0 THEN
    v_direction := 'refund_to_tenant';
    v_amount    := v_mo.refund_amount;
  ELSIF v_mo.additional_charge > 0 THEN
    v_direction := 'charge_from_tenant';
    v_amount    := v_mo.additional_charge;
  ELSE
    -- Zero net — skip settlement, go straight to settled
    UPDATE move_outs SET status = 'settled' WHERE id = p_move_out_id;
    RETURN;
  END IF;

  INSERT INTO settlements (move_out_id, amount, direction)
  VALUES (p_move_out_id, v_amount, v_direction)
  ON CONFLICT (move_out_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION approve_move_out(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_move_out(uuid) TO authenticated;
