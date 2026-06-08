-- Migration 66: Guard contract creation for advance bookings
--
-- Booking can be created for an occupied room when the current active contract
-- has a scheduled move-out. Creating the next contract must still be blocked
-- until the old tenant is actually allowed to leave:
--   - no pending/approved/active contract exists for the room, OR
--   - the existing active contract has an approved/settled move-out
--     with move_out_date <= current_date.

CREATE OR REPLACE FUNCTION guard_contract_room_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocking contracts%rowtype;
  v_has_due_moveout boolean := false;
BEGIN
  SELECT *
    INTO v_blocking
    FROM contracts
   WHERE room_id = new.room_id
     AND status IN ('pending_approve', 'approved', 'active')
   ORDER BY CASE status
              WHEN 'pending_approve' THEN 1
              WHEN 'approved' THEN 2
              WHEN 'active' THEN 3
              ELSE 4
            END,
            created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN new;
  END IF;

  IF v_blocking.status = 'active' THEN
    SELECT EXISTS (
      SELECT 1
        FROM move_outs
       WHERE contract_id = v_blocking.id
         AND status IN ('approved', 'settled')
         AND move_out_date <= current_date
    )
    INTO v_has_due_moveout;

    IF v_has_due_moveout THEN
      RETURN new;
    END IF;
  END IF;

  RAISE EXCEPTION 'Room still has an active or pending contract. Complete the approved move-out before creating a new contract.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contract_room_availability ON contracts;
CREATE TRIGGER trg_guard_contract_room_availability
  BEFORE INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION guard_contract_room_availability();
