ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'contract_cancelled_refund_required';

CREATE OR REPLACE FUNCTION on_contract_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason      text;
  v_paid_count  int;
  v_paid_total  numeric;
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

    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
      INTO v_paid_count, v_paid_total
      FROM invoices
     WHERE contract_id = new.id
       AND status = 'paid';

    IF v_paid_count > 0 THEN
      PERFORM notify_role(
        'head_staff'::user_role,
        'contract_cancelled_refund_required'::notification_type,
        'สัญญาถูกยกเลิก — ต้องคืนเงิน',
        format(
          'สัญญาเลขที่ %s ถูกยกเลิก มีใบแจ้งหนี้ที่ชำระแล้ว %s รายการ รวม %s บาท กรุณาดำเนินการคืนเงินด้วยตนเอง',
          new.contract_number,
          v_paid_count,
          to_char(v_paid_total, 'FM999,999,990.00')
        ),
        'contracts',
        new.id,
        '/contracts/' || new.id::text
      );
    END IF;

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
           SELECT 1 FROM bookings b
            WHERE b.room_id = new.room_id AND b.status = 'waiting'
         )
         AND NOT EXISTS (
           SELECT 1 FROM contracts c
            WHERE c.room_id = new.room_id
              AND c.id <> new.id
              AND c.status IN ('pending_approve', 'approved', 'active')
         );
    END IF;
  END IF;

  RETURN new;
END
$$;
