-- Migration 70: keep booking, contract, invoice, and room states in sync.
-- This fixes the stale "available room + waiting booking" state after a
-- converted contract is rejected/cancelled, and prevents cancelled invoices from
-- being marked paid by a later approval of an old pending payment.

CREATE OR REPLACE FUNCTION on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A booking that enters waiting state reserves an available room.
  -- Occupied rooms can still have advance bookings; keep them occupied.
  IF tg_op = 'INSERT' AND new.status = 'waiting' THEN
    UPDATE rooms
       SET status = 'reserved'
     WHERE id = new.room_id
       AND status = 'available';
  ELSIF tg_op = 'UPDATE'
        AND new.status = 'waiting'
        AND new.status IS DISTINCT FROM old.status THEN
    UPDATE rooms
       SET status = 'reserved'
     WHERE id = new.room_id
       AND status = 'available';
  END IF;

  IF tg_op = 'UPDATE' AND new.status IS DISTINCT FROM old.status THEN
    -- A waiting booking leaving the queue can free a reserved room only when no
    -- other active booking or contract still owns the room.
    IF old.status = 'waiting' AND new.status IN ('cancelled', 'converted') THEN
      UPDATE rooms
         SET status = 'available'
       WHERE id = new.room_id
         AND status = 'reserved'
         AND NOT EXISTS (
           SELECT 1
             FROM bookings b
            WHERE b.room_id = new.room_id
              AND b.status = 'waiting'
              AND b.id <> new.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM contracts c
            WHERE c.room_id = new.room_id
              AND c.status IN ('pending_approve', 'approved', 'active')
         );
    END IF;
  END IF;

  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS trg_booking_change ON bookings;
CREATE TRIGGER trg_booking_change
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION on_booking_change();


CREATE OR REPLACE FUNCTION on_contract_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status IN ('rejected', 'cancelled')
     AND old.status IS DISTINCT FROM new.status
     AND old.status NOT IN ('rejected', 'cancelled') THEN

    -- Close pending review payments for invoices that no longer belong to an
    -- active move-in flow.
    UPDATE payments p
       SET status = 'rejected',
           rejected_at = now(),
           rejection_reason = COALESCE(p.rejection_reason, 'Contract was cancelled/rejected before payment approval')
      FROM invoices i
     WHERE p.invoice_id = i.id
       AND i.contract_id = new.id
       AND p.status = 'pending_approve'
       AND i.status IN ('pending', 'overdue', 'paid_pending_approve', 'rejected');

    UPDATE invoices
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, now()),
           cancelled_by = COALESCE(cancelled_by, auth.uid()),
           cancellation_reason = COALESCE(cancellation_reason, 'Contract was cancelled/rejected')
     WHERE contract_id = new.id
       AND status IN ('pending', 'overdue', 'paid_pending_approve', 'rejected');

    IF new.booking_id IS NOT NULL THEN
      -- A cancelled/rejected converted contract goes back to its booking.
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

DROP TRIGGER IF EXISTS trg_contract_finalized ON contracts;
CREATE TRIGGER trg_contract_finalized
  AFTER UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION on_contract_finalized();


CREATE OR REPLACE FUNCTION on_payment_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invoices%rowtype;
  v_total_paid numeric(12,2);
BEGIN
  IF new.status = 'approved'
     AND (old.status IS NULL OR old.status <> 'approved') THEN
    SELECT *
      INTO v_inv
      FROM invoices
     WHERE id = new.invoice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found for payment %', new.id;
    END IF;

    IF v_inv.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot approve payment for a cancelled invoice';
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_total_paid
      FROM payments
     WHERE invoice_id = new.invoice_id
       AND status = 'approved';

    IF v_total_paid >= v_inv.total_amount THEN
      UPDATE invoices SET status = 'paid' WHERE id = new.invoice_id;
    ELSE
      RAISE EXCEPTION 'Partial payment not allowed. Invoice total: %, paid: %',
        v_inv.total_amount, v_total_paid;
    END IF;
  END IF;

  RETURN new;
END
$$;

-- Repair data already left in inconsistent states.
UPDATE rooms r
   SET status = 'reserved'
 WHERE r.status = 'available'
   AND EXISTS (
     SELECT 1
       FROM bookings b
      WHERE b.room_id = r.id
        AND b.status = 'waiting'
   );

UPDATE rooms r
   SET status = 'available'
 WHERE r.status = 'reserved'
   AND NOT EXISTS (
     SELECT 1
       FROM bookings b
      WHERE b.room_id = r.id
        AND b.status = 'waiting'
   )
   AND NOT EXISTS (
     SELECT 1
       FROM contracts c
      WHERE c.room_id = r.id
        AND c.status IN ('pending_approve', 'approved', 'active')
   );
