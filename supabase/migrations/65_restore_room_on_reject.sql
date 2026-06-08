-- Migration 65: Restore room to occupied when a move-out is rejected
--
-- Gap: on_move_out_submitted (migration 32/62) frees the room immediately when
-- a move-out is submitted (pending_accounting) and move_out_date <= today.
-- But when head_staff rejects → status reverts to draft, no trigger fired →
-- room stays 'available' while the contract is still active.
--
-- Fix: fire after any UPDATE on move_outs that transitions
-- pending_accounting → draft and restore room if it was freed.

CREATE OR REPLACE FUNCTION on_move_out_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'draft' AND old.status = 'pending_accounting' THEN
    UPDATE rooms SET status = 'occupied'
    WHERE id = new.room_id AND status = 'available';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_move_out_rejected ON move_outs;
CREATE TRIGGER trg_move_out_rejected
  AFTER UPDATE ON move_outs
  FOR EACH ROW EXECUTE FUNCTION on_move_out_rejected();
