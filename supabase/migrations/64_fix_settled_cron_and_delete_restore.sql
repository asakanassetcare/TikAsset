-- Migration 64: Fix two root-cause bugs + one-time addon lifecycle
--
-- Bug 1: process_due_move_outs() only selected status='approved'.
--   If accounting confirmed settlement before move_out_date, status became
--   'settled' and the cron skipped it → contract stayed active, room stayed
--   occupied forever.
--
-- Bug 2: on_move_out_deleted() comment promised contract restore but code
--   only restored room status. Cancelling a past-dated approved move-out
--   left the contract as terminated/expired permanently.
--
-- Bug 3: frontend deactivated one-time addons at draft-save time.
--   If the move-out was later rejected or cancelled the addons stayed
--   is_active=false and were lost from the outstanding calculation forever.
--   Fix: deactivate in on_move_out_approved, re-activate in on_move_out_deleted.
--
-- Also: add 'settled' to the delete policy so super_admin can clean up stuck
-- records from the UI without needing direct DB access.

-- ─── 1. Fix process_due_move_outs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_due_move_outs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo move_outs%rowtype;
BEGIN
  -- Pick up approved AND settled move-outs whose date has arrived but contract
  -- not yet closed. A settled move-out means accounting confirmed early — the
  -- actual room/contract change must still happen on move_out_date.
  FOR v_mo IN
    SELECT mo.*
    FROM move_outs mo
    JOIN contracts c ON c.id = mo.contract_id
    WHERE mo.status IN ('approved', 'settled')
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

-- ─── 2. on_move_out_approved — add one-time addon deactivation ────────────────
-- Full replacement of migration 62 version; only change is the UPDATE below.
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

    -- Deactivate one-time addons — amount is already captured in
    -- outstanding_invoice_total; prevents them appearing in future calculations.
    UPDATE contract_addons SET is_active = false
    WHERE contract_id = new.contract_id
      AND billing_cycle = 'one_time'
      AND is_active = true;

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

-- ─── 3. on_move_out_deleted — restore contract + re-activate addons ──────────
CREATE OR REPLACE FUNCTION on_move_out_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── draft / pending_accounting ──────────────────────────────────────────────
  IF old.status IN ('draft', 'pending_accounting') THEN
    -- Room was freed only if move_out_date <= today (migration 32/62 guard),
    -- so restore unconditionally; harmless if room is already occupied.
    UPDATE rooms SET status = 'occupied' WHERE id = old.room_id AND status = 'available';
    -- Addons were never deactivated for these statuses — nothing to re-activate.
    -- Contract was never touched — nothing to restore.
  END IF;

  -- ── approved ────────────────────────────────────────────────────────────────
  IF old.status = 'approved' THEN
    -- Addons were deactivated at approval time — always re-activate on cancel.
    UPDATE contract_addons SET is_active = true
    WHERE contract_id = old.contract_id
      AND billing_cycle = 'one_time'
      AND is_active = false;

    IF old.move_out_date::date > current_date THEN
      -- Future-dated: room still occupied, contract still active — nothing more to restore.
      NULL;
    ELSE
      -- Past-dated: room was freed + contract was closed — undo both.
      UPDATE rooms SET status = 'occupied'
      WHERE id = old.room_id AND status = 'available';

      UPDATE contracts SET
        status             = 'active',
        terminated_at      = NULL,
        actual_move_out_at = NULL,
        termination_reason = NULL,
        electric_meter_end = NULL,
        water_meter_end    = NULL
      WHERE id = old.contract_id
        AND status IN ('terminated', 'expired');
    END IF;
  END IF;

  -- ── settled ─────────────────────────────────────────────────────────────────
  IF old.status = 'settled' THEN
    -- Re-activate addons so a new move-out can include them.
    UPDATE contract_addons SET is_active = true
    WHERE contract_id = old.contract_id
      AND billing_cycle = 'one_time'
      AND is_active = false;

    IF old.move_out_date::date > current_date THEN
      -- Settlement confirmed in advance; room/contract not yet closed.
      UPDATE rooms SET status = 'occupied'
      WHERE id = old.room_id AND status = 'available';
    ELSE
      -- Past-dated settled: room freed + contract closed — undo both.
      UPDATE rooms SET status = 'occupied'
      WHERE id = old.room_id AND status = 'available';

      UPDATE contracts SET
        status             = 'active',
        terminated_at      = NULL,
        actual_move_out_at = NULL,
        termination_reason = NULL,
        electric_meter_end = NULL,
        water_meter_end    = NULL
      WHERE id = old.contract_id
        AND status IN ('terminated', 'expired');
    END IF;
  END IF;

  -- Always clean up settlement so the FK + unique constraint are free.
  DELETE FROM settlements WHERE move_out_id = old.id;

  RETURN old;
END;
$$;

-- ─── 4. Expand delete policy to include settled (super_admin only) ────────────
DROP POLICY IF EXISTS "move_outs_delete" ON move_outs;

CREATE POLICY "move_outs_delete" ON move_outs
  FOR DELETE USING (
    -- Staff can cancel their own draft
    (status = 'draft' AND is_operational())
    OR
    -- Head staff / super_admin can cancel pending or approved move-outs
    (status IN ('pending_accounting', 'approved') AND (is_super_admin() OR is_head_staff()))
    OR
    -- Only super_admin can clean up stuck settled records
    (status = 'settled' AND is_super_admin())
  );
