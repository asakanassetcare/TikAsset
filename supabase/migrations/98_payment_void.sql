ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS void_status          text
    CHECK (void_status IN ('void_pending','voided','void_rejected')),
  ADD COLUMN IF NOT EXISTS void_type            text
    CHECK (void_type IN ('document_only','payment_reversal')),
  ADD COLUMN IF NOT EXISTS void_reason          text,
  ADD COLUMN IF NOT EXISTS void_requested_by    uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_requested_at    timestamptz,
  ADD COLUMN IF NOT EXISTS void_approved_by     uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS void_rejected_by     uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS void_rejected_reason text,
  ADD COLUMN IF NOT EXISTS voided_at            timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_void_status
  ON payments(void_status)
  WHERE void_status IS NOT NULL;

CREATE OR REPLACE FUNCTION request_payment_void(
  p_payment_id  uuid,
  p_void_type   text,
  p_void_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%rowtype;
  v_caller  uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('accounting','super_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_void_type NOT IN ('document_only','payment_reversal') THEN
    RAISE EXCEPTION 'Invalid void_type: %', p_void_type;
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved payments can have their receipt voided (current status: %)', v_payment.status;
  END IF;
  IF v_payment.void_status IS NOT NULL AND v_payment.void_status <> 'void_rejected' THEN
    RAISE EXCEPTION 'Payment is already in void status: %', v_payment.void_status;
  END IF;

  UPDATE payments SET
    void_status          = 'void_pending',
    void_type            = p_void_type,
    void_reason          = p_void_reason,
    void_requested_by    = v_caller,
    void_requested_at    = now(),
    void_rejected_by     = NULL,
    void_rejected_at     = NULL,
    void_rejected_reason = NULL
  WHERE id = p_payment_id;

  PERFORM notify_role(
    'executive'::user_role,
    'receipt_void_requested'::notification_type,
    'ขอยกเลิกใบเสร็จ ' || (SELECT invoice_number FROM invoices WHERE id = v_payment.invoice_id),
    'เหตุผล: ' || p_void_reason,
    'payments',
    p_payment_id,
    null
  );
END;
$$;

CREATE OR REPLACE FUNCTION approve_payment_void(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment    payments%rowtype;
  v_invoice_id uuid;
  v_rows       int;
  v_caller     uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('super_admin','executive')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.void_status <> 'void_pending' THEN
    RAISE EXCEPTION 'Payment void is not pending (current status: %)', v_payment.void_status;
  END IF;

  UPDATE payments SET
    void_status      = 'voided',
    void_approved_by = v_caller,
    void_approved_at = now(),
    voided_at        = now()
  WHERE id = p_payment_id;

  IF v_payment.void_type = 'payment_reversal' THEN
    v_invoice_id := v_payment.invoice_id;

    UPDATE payments SET
      status           = 'rejected',
      rejection_reason = 'ยกเลิกใบเสร็จ — ต้องรับชำระใหม่'
    WHERE id = p_payment_id AND status = 'approved';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Payment is not in approved status — possible concurrent modification';
    END IF;

    UPDATE invoices SET status = 'receipt_voided'
    WHERE id = v_invoice_id AND status = 'paid';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Invoice is not in paid status — possible concurrent modification';
    END IF;
  END IF;

  PERFORM notify_user(
    v_payment.void_requested_by,
    'receipt_void_approved'::notification_type,
    'อนุมัติยกเลิกใบเสร็จ',
    CASE v_payment.void_type
      WHEN 'document_only'    THEN 'ยกเลิกใบเสร็จแล้ว (เอกสารผิด) — สามารถออกใบเสร็จใหม่ได้'
      WHEN 'payment_reversal' THEN 'ยกเลิกใบเสร็จแล้ว — กรุณารับชำระใหม่ก่อนออกใบเสร็จ'
      ELSE ''
    END,
    'payments',
    p_payment_id,
    null
  );
END;
$$;

CREATE OR REPLACE FUNCTION reject_payment_void(
  p_payment_id       uuid,
  p_rejection_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%rowtype;
  v_caller  uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('super_admin','executive')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.void_status <> 'void_pending' THEN
    RAISE EXCEPTION 'Payment void is not pending (current status: %)', v_payment.void_status;
  END IF;

  UPDATE payments SET
    void_status          = 'void_rejected',
    void_rejected_by     = v_caller,
    void_rejected_at     = now(),
    void_rejected_reason = p_rejection_reason
  WHERE id = p_payment_id;

  PERFORM notify_user(
    v_payment.void_requested_by,
    'receipt_void_rejected'::notification_type,
    'ปฏิเสธการยกเลิกใบเสร็จ',
    'เหตุผล: ' || p_rejection_reason,
    'payments',
    p_payment_id,
    null
  );
END;
$$;

REVOKE ALL ON FUNCTION request_payment_void(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_payment_void(uuid)              FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_payment_void(uuid, text)         FROM PUBLIC;

GRANT EXECUTE ON FUNCTION request_payment_void(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payment_void(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION reject_payment_void(uuid, text)         TO authenticated;
