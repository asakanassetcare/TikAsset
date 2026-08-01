ALTER TYPE invoice_status    ADD VALUE IF NOT EXISTS 'receipt_voided' AFTER 'paid';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_void_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_void_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_void_rejected';

ALTER TABLE receipts
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
  ADD COLUMN IF NOT EXISTS voided_at            timestamptz,
  ADD COLUMN IF NOT EXISTS original_receipt_id  uuid REFERENCES receipts(id);

CREATE INDEX IF NOT EXISTS idx_receipts_void_status
  ON receipts(void_status)
  WHERE void_status IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_original_receipt_id
  ON receipts(original_receipt_id)
  WHERE original_receipt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION request_receipt_void(
  p_receipt_id uuid,
  p_void_type  text,
  p_void_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt  receipts%rowtype;
  v_caller   uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('accounting','super_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_void_type NOT IN ('document_only','payment_reversal') THEN
    RAISE EXCEPTION 'Invalid void_type: %', p_void_type;
  END IF;

  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;

  IF v_receipt.head_approved_at IS NULL THEN
    RAISE EXCEPTION 'Only approved receipts can be voided';
  END IF;

  IF v_receipt.void_status IS NOT NULL AND v_receipt.void_status <> 'void_rejected' THEN
    RAISE EXCEPTION 'Receipt is already in void status: %', v_receipt.void_status;
  END IF;

  IF v_receipt.ref_table IS DISTINCT FROM 'payments' THEN
    RAISE EXCEPTION 'Void is not supported for % receipts at this time', COALESCE(v_receipt.ref_table, 'this type of');
  END IF;

  IF p_void_type = 'payment_reversal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments WHERE id = v_receipt.ref_id AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'The linked payment is not in approved status';
    END IF;
  END IF;

  UPDATE receipts SET
    void_status          = 'void_pending',
    void_type            = p_void_type,
    void_reason          = p_void_reason,
    void_requested_by    = v_caller,
    void_requested_at    = now(),
    void_rejected_by     = NULL,
    void_rejected_at     = NULL,
    void_rejected_reason = NULL
  WHERE id = p_receipt_id;

  PERFORM notify_role(
    'executive'::user_role,
    'receipt_void_requested'::notification_type,
    'ขอยกเลิกใบเสร็จ ' || v_receipt.receipt_number,
    'เหตุผล: ' || p_void_reason,
    'payments',
    p_receipt_id,
    null
  );
END;
$$;

CREATE OR REPLACE FUNCTION approve_receipt_void(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt    receipts%rowtype;
  v_payment_id uuid;
  v_invoice_id uuid;
  v_rows       int;
  v_caller     uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('super_admin','executive')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_receipt.void_status <> 'void_pending' THEN
    RAISE EXCEPTION 'Receipt void is not pending (current status: %)', v_receipt.void_status;
  END IF;

  UPDATE receipts SET
    void_status      = 'voided',
    void_approved_by = v_caller,
    void_approved_at = now(),
    voided_at        = now()
  WHERE id = p_receipt_id;

  IF v_receipt.void_type = 'payment_reversal' THEN
    v_payment_id := v_receipt.ref_id;
    SELECT invoice_id INTO v_invoice_id FROM payments WHERE id = v_payment_id;

    UPDATE payments SET
      status           = 'rejected',
      rejection_reason = 'ยกเลิกใบเสร็จ ' || v_receipt.receipt_number || ' — ต้องรับชำระใหม่'
    WHERE id = v_payment_id AND status = 'approved';
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
    v_receipt.void_requested_by,
    'receipt_void_approved'::notification_type,
    'อนุมัติยกเลิกใบเสร็จ ' || v_receipt.receipt_number,
    CASE v_receipt.void_type
      WHEN 'document_only'    THEN 'สามารถออกใบเสร็จใหม่ได้ทันที'
      WHEN 'payment_reversal' THEN 'กรุณารับชำระใหม่ให้ถูกต้องก่อนออกใบเสร็จใหม่'
      ELSE ''
    END,
    'payments',
    p_receipt_id,
    null
  );
END;
$$;

CREATE OR REPLACE FUNCTION reject_receipt_void(
  p_receipt_id      uuid,
  p_rejection_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt receipts%rowtype;
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

  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_receipt.void_status <> 'void_pending' THEN
    RAISE EXCEPTION 'Receipt void is not pending (current status: %)', v_receipt.void_status;
  END IF;

  UPDATE receipts SET
    void_status          = 'void_rejected',
    void_rejected_by     = v_caller,
    void_rejected_at     = now(),
    void_rejected_reason = p_rejection_reason
  WHERE id = p_receipt_id;

  PERFORM notify_user(
    v_receipt.void_requested_by,
    'receipt_void_rejected'::notification_type,
    'ปฏิเสธการยกเลิกใบเสร็จ ' || v_receipt.receipt_number,
    'เหตุผล: ' || p_rejection_reason,
    'payments',
    p_receipt_id,
    null
  );
END;
$$;

CREATE OR REPLACE FUNCTION issue_replacement_receipt(
  p_original_receipt_id uuid,
  p_amount              numeric,
  p_description         text,
  p_payer_name          text,
  p_ref_table           text,
  p_ref_id              uuid,
  p_building_id         uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original  receipts%rowtype;
  v_caller    uuid := auth.uid();
  v_new_id    uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role IN ('accounting','super_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_original FROM receipts WHERE id = p_original_receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original receipt not found'; END IF;
  IF v_original.void_status <> 'voided' THEN
    RAISE EXCEPTION 'Original receipt is not voided (current status: %)', v_original.void_status;
  END IF;

  IF EXISTS (SELECT 1 FROM receipts WHERE original_receipt_id = p_original_receipt_id) THEN
    RAISE EXCEPTION 'A replacement receipt has already been issued for this receipt';
  END IF;

  IF v_original.void_type = 'payment_reversal' THEN
    DECLARE
      v_invoice_status text;
      v_invoice_id     uuid;
    BEGIN
      SELECT invoice_id INTO v_invoice_id FROM payments WHERE id = v_original.ref_id;
      SELECT status::text INTO v_invoice_status FROM invoices WHERE id = v_invoice_id;
      IF v_invoice_status IS DISTINCT FROM 'paid' THEN
        RAISE EXCEPTION 'Invoice must be paid before issuing a replacement receipt (current status: %)', v_invoice_status;
      END IF;
    END;
  END IF;

  INSERT INTO receipts (
    amount, description, payer_name,
    ref_table, ref_id,
    issued_by, issued_at,
    status,
    building_id,
    original_receipt_id
  ) VALUES (
    p_amount, p_description, p_payer_name,
    p_ref_table, p_ref_id,
    v_caller, now(),
    'pending',
    p_building_id,
    p_original_receipt_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION request_receipt_void(uuid, text, text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_receipt_void(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_receipt_void(uuid, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_replacement_receipt(uuid, numeric, text, text, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION request_receipt_void(uuid, text, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION approve_receipt_void(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION reject_receipt_void(uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION issue_replacement_receipt(uuid, numeric, text, text, text, uuid, uuid) TO authenticated;
