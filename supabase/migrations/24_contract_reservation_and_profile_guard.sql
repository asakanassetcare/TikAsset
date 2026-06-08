-- ============================================================================
-- Migration 24: Contract reservation + profile self-update guard
--
-- A contract is not the same as move-in. Pending/approved contracts should only
-- reserve inventory. The existing move-in trigger still owns the transition to
-- occupied when staff sets actual_move_in_at.
-- ============================================================================

-- Reserve an available room as soon as a direct contract is created.
-- Booking conversions already have the room reserved by the booking trigger.
CREATE OR REPLACE FUNCTION reserve_room_on_contract_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_status room_status;
BEGIN
  IF new.status IN ('pending_approve', 'approved') THEN
    SELECT status
      INTO v_room_status
      FROM rooms
     WHERE id = new.room_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room not found for contract %', new.id;
    END IF;

    IF new.booking_id IS NULL AND v_room_status <> 'available' THEN
      RAISE EXCEPTION 'Direct contracts can only be created for available rooms';
    END IF;

    IF new.booking_id IS NOT NULL AND v_room_status <> 'reserved' THEN
      RAISE EXCEPTION 'Booking conversions require a reserved room';
    END IF;

    UPDATE rooms
       SET status = 'reserved'
     WHERE id = new.room_id
       AND status = 'available';
  END IF;

  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS trg_contract_reserve_room ON contracts;
CREATE TRIGGER trg_contract_reserve_room
  AFTER INSERT ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION reserve_room_on_contract_pending();

-- Backfill rooms that already have pending/approved contracts but still look
-- available. Do not touch occupied rooms; actual_move_in_at remains the move-in
-- source of truth.
UPDATE rooms r
   SET status = 'reserved'
 WHERE status = 'available'
   AND EXISTS (
     SELECT 1
       FROM contracts c
      WHERE c.room_id = r.id
        AND c.status IN ('pending_approve', 'approved')
        AND c.actual_move_in_at IS NULL
   );

-- Prevent users from changing protected profile fields on their own row via a
-- direct client update. Super admins can still manage profiles through the
-- existing profiles_super_admin_all policy.
CREATE OR REPLACE FUNCTION guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = old.id AND current_user_role() IS DISTINCT FROM 'super_admin' THEN
    IF new.id IS DISTINCT FROM old.id
       OR new.email IS DISTINCT FROM old.email
       OR new.full_name IS DISTINCT FROM old.full_name
       OR new.role IS DISTINCT FROM old.role
       OR new.created_at IS DISTINCT FROM old.created_at THEN
      RAISE EXCEPTION 'Profile protected fields cannot be changed by this user';
    END IF;
  END IF;

  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_self_update ON profiles;
CREATE TRIGGER trg_profiles_guard_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_self_update();

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_basic" ON profiles;

CREATE POLICY "profiles_update_own_basic" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
