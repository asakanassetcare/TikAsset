-- Migration 41: Add bank_name to settlements and update confirm_settlement_paid
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS bank_name text;

CREATE OR REPLACE FUNCTION confirm_settlement_paid(
  p_settlement_id uuid,
  p_slip_url      text,
  p_bank_ref      text default null,
  p_note          text default null,
  p_bank_name     text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_mo_id    uuid;
BEGIN
  SELECT id INTO v_staff_id
  FROM profiles
  WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_staff', 'staff', 'accounting');
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT move_out_id INTO v_mo_id
  FROM settlements WHERE id = p_settlement_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found or already processed'; END IF;

  UPDATE settlements SET
    status         = 'paid_by_staff',
    slip_url       = p_slip_url,
    bank_reference = p_bank_ref,
    bank_name      = p_bank_name,
    note           = p_note,
    paid_by_staff  = v_staff_id,
    paid_at        = now()
  WHERE id = p_settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION confirm_settlement_paid(uuid, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_settlement_paid(uuid, text, text, text, text) TO authenticated;
