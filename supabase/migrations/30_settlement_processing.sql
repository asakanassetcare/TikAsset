-- Migration 30: Settlement processing flow
--
-- Adds:
--   - 'processing' status for refund_to_tenant (accounting acknowledged, working on it)
--   - accounting_slip_url, accounting_bank_ref, accounting_note columns
--   - accounting_accept_settlement() RPC: pending+refund → processing
--   - Updated confirm_settlement_completed() accepts slip and note params

-- 1. New status value
ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'processing' AFTER 'pending';

-- 2. New columns for accounting's proof
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS accounting_slip_url  text,
  ADD COLUMN IF NOT EXISTS accounting_bank_ref  text,
  ADD COLUMN IF NOT EXISTS accounting_note      text;

-- 3. RPC: accounting accepts the refund task (pending → processing)
CREATE OR REPLACE FUNCTION accounting_accept_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct_id  uuid;
  v_status   text;
  v_direction text;
BEGIN
  SELECT id INTO v_acct_id
  FROM profiles
  WHERE id = auth.uid()
    AND role IN ('accounting', 'super_admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT status, direction
  INTO v_status, v_direction
  FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  IF v_direction != 'refund_to_tenant' THEN
    RAISE EXCEPTION 'Accept is only for refund settlements';
  END IF;
  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Settlement is not in pending state';
  END IF;

  UPDATE settlements SET status = 'processing' WHERE id = p_settlement_id;
END
$$;

REVOKE ALL ON FUNCTION accounting_accept_settlement(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION accounting_accept_settlement(uuid) TO authenticated;

-- 4. Updated confirm: accepts slip + bank_ref + note, handles processing and paid_by_staff states
CREATE OR REPLACE FUNCTION confirm_settlement_completed(
  p_settlement_id uuid,
  p_slip_url      text default null,
  p_bank_ref      text default null,
  p_note          text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct_id   uuid;
  v_mo_id     uuid;
  v_direction text;
  v_status    text;
  v_amount    numeric(12,2);
BEGIN
  SELECT id INTO v_acct_id
  FROM profiles
  WHERE id = auth.uid()
    AND role IN ('accounting', 'super_admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT move_out_id, direction, status, amount
  INTO v_mo_id, v_direction, v_status, v_amount
  FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  -- Charge: staff must collect first
  IF v_direction = 'charge_from_tenant' AND v_status = 'pending' THEN
    RAISE EXCEPTION 'Staff must record receipt before accounting can confirm';
  END IF;

  IF v_status NOT IN ('pending', 'processing', 'paid_by_staff') THEN
    RAISE EXCEPTION 'Settlement cannot be confirmed in state: %', v_status;
  END IF;

  UPDATE settlements SET
    status              = 'completed',
    confirmed_by        = v_acct_id,
    confirmed_at        = now(),
    accounting_slip_url = p_slip_url,
    accounting_bank_ref = p_bank_ref,
    accounting_note     = p_note
  WHERE id = p_settlement_id;

  UPDATE move_outs SET status = 'settled' WHERE id = v_mo_id;
END
$$;

REVOKE ALL ON FUNCTION confirm_settlement_completed(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_settlement_completed(uuid, text, text, text) TO authenticated;
