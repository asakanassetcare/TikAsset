-- Migration 71: make booking -> contract conversion atomic.
-- The frontend used to insert into contracts, then update bookings in a second
-- request. If the second request failed, both records could remain active.

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
     WHERE id = new.room_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room not found for contract %', new.id;
    END IF;

    IF new.booking_id IS NULL AND v_room_status <> 'available' THEN
      RAISE EXCEPTION 'Direct contracts can only be created for available rooms';
    END IF;

    IF new.booking_id IS NOT NULL AND v_room_status NOT IN ('available', 'reserved') THEN
      RAISE EXCEPTION 'Booking conversions require an available or reserved room';
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


CREATE OR REPLACE FUNCTION create_contract_from_booking(
  p_booking_id uuid,
  p_contract_start_date date,
  p_contract_end_date date,
  p_move_in_date date,
  p_monthly_rent numeric,
  p_deposit_amount numeric DEFAULT 0,
  p_advance_rent_amount numeric DEFAULT 0,
  p_payment_day int DEFAULT 1,
  p_booking_deposit_applied numeric DEFAULT 0,
  p_electric_meter_start numeric DEFAULT NULL,
  p_water_meter_start numeric DEFAULT NULL,
  p_assigned_staff_id uuid DEFAULT NULL,
  p_management_fee_amount numeric DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%rowtype;
  v_contract_id uuid;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF current_user_role() NOT IN ('super_admin', 'head_staff', 'staff') THEN
    RAISE EXCEPTION 'Only operational staff can create contracts from bookings';
  END IF;

  IF p_assigned_staff_id IS NULL THEN
    RAISE EXCEPTION 'Assigned staff is required';
  END IF;

  IF p_contract_start_date IS NULL
     OR p_contract_end_date IS NULL
     OR p_move_in_date IS NULL THEN
    RAISE EXCEPTION 'Contract dates are required';
  END IF;

  IF p_monthly_rent IS NULL OR p_monthly_rent <= 0 THEN
    RAISE EXCEPTION 'Monthly rent must be greater than zero';
  END IF;

  IF COALESCE(p_deposit_amount, 0) < 0
     OR COALESCE(p_advance_rent_amount, 0) < 0
     OR COALESCE(p_booking_deposit_applied, 0) < 0
     OR COALESCE(p_management_fee_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Money amounts cannot be negative';
  END IF;

  IF p_payment_day < 1 OR p_payment_day > 28 THEN
    RAISE EXCEPTION 'Payment day must be between 1 and 28';
  END IF;

  SELECT *
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'waiting' THEN
    RAISE EXCEPTION 'Booking is not waiting (current: %)', v_booking.status;
  END IF;

  INSERT INTO contracts (
    room_id,
    tenant_id,
    booking_id,
    contract_start_date,
    contract_end_date,
    move_in_date,
    monthly_rent,
    deposit_amount,
    advance_rent_amount,
    payment_day,
    booking_deposit_applied,
    electric_meter_start,
    water_meter_start,
    assigned_staff_id,
    management_fee_amount,
    note,
    created_by,
    status
  ) VALUES (
    v_booking.room_id,
    v_booking.tenant_id,
    v_booking.id,
    p_contract_start_date,
    p_contract_end_date,
    p_move_in_date,
    p_monthly_rent,
    COALESCE(p_deposit_amount, 0),
    COALESCE(p_advance_rent_amount, 0),
    COALESCE(p_payment_day, 1),
    COALESCE(p_booking_deposit_applied, 0),
    p_electric_meter_start,
    p_water_meter_start,
    p_assigned_staff_id,
    COALESCE(p_management_fee_amount, 0),
    NULLIF(TRIM(p_note), ''),
    auth.uid(),
    'pending_approve'
  )
  RETURNING id INTO v_contract_id;

  UPDATE bookings
     SET status = 'converted',
         converted_to_contract_id = v_contract_id,
         converted_at = now()
   WHERE id = v_booking.id
     AND status = 'waiting';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'Booking conversion failed';
  END IF;

  RETURN v_contract_id;
END
$$;

REVOKE ALL ON FUNCTION create_contract_from_booking(
  uuid, date, date, date, numeric, numeric, numeric, int, numeric,
  numeric, numeric, uuid, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_contract_from_booking(
  uuid, date, date, date, numeric, numeric, numeric, int, numeric,
  numeric, numeric, uuid, numeric, text
) TO authenticated;
