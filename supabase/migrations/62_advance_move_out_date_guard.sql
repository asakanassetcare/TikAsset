-- Migration 62: Support advance move-out notices
--
-- Previously BOTH the on_move_out_approved trigger (migration 29) AND the
-- approve_move_out RPC (migration 38) freed the room and closed the contract
-- immediately on approval, regardless of move_out_date.
--
-- Fix:
--   1. on_move_out_approved trigger fn — add move_out_date <= today guard
--   2. on_move_out_submitted trigger fn — add move_out_date <= today guard
--   3. approve_move_out RPC            — add move_out_date <= today guard
--   4. process_due_move_outs cron      — applies deferred changes when date arrives

-- ─── 1. Approved trigger ─────────────────────────────────────────────────────
-- Called by trg_move_out_approved (created in migration 03, still active).
-- Only close contract + free room when move_out_date has arrived.
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

    -- Guard: only close contract + free room if move_out_date has arrived.
    -- Future-dated move-outs stay active until the cron picks them up.
    IF new.move_out_date::date <= current_date THEN
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

    -- Always create settlement record (accounting can see it in advance).
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

-- ─── 2. Submitted trigger ────────────────────────────────────────────────────
-- Called by trg_move_out_submitted (migration 32).
-- Only free room if move_out_date has arrived.
CREATE OR REPLACE FUNCTION on_move_out_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'pending_accounting'
     AND (old.status IS NULL OR old.status <> 'pending_accounting')
     AND new.move_out_date::date <= current_date
  THEN
    UPDATE rooms SET status = 'available' WHERE id = new.room_id;
  END IF;
  RETURN new;
END
$$;

-- ─── 3. Approve RPC ──────────────────────────────────────────────────────────
-- The RPC also does contract/room changes directly (migration 38).
-- Add the same guard so it doesn't race with the trigger.
CREATE OR REPLACE FUNCTION approve_move_out(p_move_out_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo          move_outs%rowtype;
  v_approver_id uuid;
BEGIN
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

  -- Flip status → triggers on_move_out_approved() which handles everything.
  -- We no longer duplicate contract/room/settlement logic here.
  UPDATE move_outs SET
    status      = 'approved',
    approved_by = v_approver_id,
    approved_at = now()
  WHERE id = p_move_out_id;
END;
$$;

REVOKE ALL ON FUNCTION approve_move_out(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_move_out(uuid) TO authenticated;

-- ─── 4. Cron: apply deferred room/contract changes ───────────────────────────
CREATE OR REPLACE FUNCTION process_due_move_outs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo move_outs%rowtype;
BEGIN
  -- Approved move-outs whose date has now arrived but contract not yet closed
  FOR v_mo IN
    SELECT mo.*
    FROM move_outs mo
    JOIN contracts c ON c.id = mo.contract_id
    WHERE mo.status = 'approved'
      AND mo.move_out_date::date <= current_date
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

-- Run daily at 00:05 Bangkok time = 17:05 UTC
SELECT cron.schedule(
  'process_due_move_outs',
  '5 17 * * *',
  $$SELECT process_due_move_outs();$$
);
