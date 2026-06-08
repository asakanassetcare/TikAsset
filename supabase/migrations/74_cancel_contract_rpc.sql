-- Migration 74: centralize contract cancellation in an RPC.
-- Frontend should not update contract.status directly for cancellation because
-- invoice/payment/booking/room cleanup is owned by database triggers.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE OR REPLACE FUNCTION on_contract_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  IF new.status IN ('rejected', 'cancelled')
     AND old.status IS DISTINCT FROM new.status
     AND old.status NOT IN ('rejected', 'cancelled') THEN

    v_reason := COALESCE(
      NULLIF(TRIM(new.cancel_reason), ''),
      NULLIF(TRIM(new.rejection_reason), ''),
      'Contract was cancelled/rejected'
    );

    UPDATE payments p
       SET status = 'rejected',
           rejected_at = now(),
           rejection_reason = COALESCE(p.rejection_reason, v_reason)
      FROM invoices i
     WHERE p.invoice_id = i.id
       AND i.contract_id = new.id
       AND p.status = 'pending_approve'
       AND i.status IN ('pending', 'overdue', 'paid_pending_approve', 'rejected');

    UPDATE invoices
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, now()),
           cancelled_by = COALESCE(cancelled_by, COALESCE(new.cancelled_by, new.rejected_by, auth.uid())),
           cancellation_reason = COALESCE(cancellation_reason, v_reason)
     WHERE contract_id = new.id
       AND status IN ('pending', 'overdue', 'paid_pending_approve', 'rejected');

    IF new.booking_id IS NOT NULL THEN
      UPDATE bookings
         SET status = 'waiting',
             converted_to_contract_id = NULL,
             converted_at = NULL
       WHERE id = new.booking_id;

      UPDATE rooms
         SET status = 'reserved'
       WHERE id = new.room_id
         AND status = 'available';
    ELSE
      UPDATE rooms
         SET status = 'available'
       WHERE id = new.room_id
         AND status = 'reserved'
         AND NOT EXISTS (
           SELECT 1
             FROM bookings b
            WHERE b.room_id = new.room_id
              AND b.status = 'waiting'
         )
         AND NOT EXISTS (
           SELECT 1
             FROM contracts c
            WHERE c.room_id = new.room_id
              AND c.id <> new.id
              AND c.status IN ('pending_approve', 'approved', 'active')
         );
    END IF;
  END IF;

  RETURN new;
END
$$;

CREATE OR REPLACE FUNCTION cancel_contract(
  p_contract_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF current_user_role() NOT IN ('super_admin', 'head_staff', 'staff') THEN
    RAISE EXCEPTION 'Only operational staff can cancel contracts';
  END IF;

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  SELECT *
    INTO v_contract
    FROM contracts
   WHERE id = p_contract_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF v_contract.status IN ('cancelled', 'rejected', 'terminated', 'expired') THEN
    RAISE EXCEPTION 'Contract is already finalized (current: %)', v_contract.status;
  END IF;

  IF v_contract.status = 'active' THEN
    RAISE EXCEPTION 'Active contracts must be ended through move-out flow';
  END IF;

  UPDATE contracts
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = TRIM(p_reason),
         updated_at = now()
   WHERE id = p_contract_id;
END
$$;

REVOKE ALL ON FUNCTION cancel_contract(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_contract(uuid, text) TO authenticated;
