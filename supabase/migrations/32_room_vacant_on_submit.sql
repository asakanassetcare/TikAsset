-- Migration 32: Room becomes available when move-out is submitted (pending_accounting),
-- not waiting for approval. Whichever comes first (submit or approve) frees the room.
-- Cancelling a draft/pending move-out restores the room to occupied.

-- 1. Trigger: pending_accounting → room available
CREATE OR REPLACE FUNCTION on_move_out_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'pending_accounting'
     AND (old.status IS NULL OR old.status <> 'pending_accounting')
  THEN
    UPDATE rooms SET status = 'available' WHERE id = new.room_id;
  END IF;
  RETURN new;
END
$$;

DROP TRIGGER IF EXISTS trg_move_out_submitted ON move_outs;
CREATE TRIGGER trg_move_out_submitted
  AFTER UPDATE ON move_outs
  FOR EACH ROW
  EXECUTE FUNCTION on_move_out_submitted();

-- 2. Trigger: delete (cancel) → room back to occupied
--    Only when move-out was still in-progress (not yet approved/settled)
CREATE OR REPLACE FUNCTION on_move_out_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF old.status IN ('draft', 'pending_accounting') THEN
    UPDATE rooms SET status = 'occupied' WHERE id = old.room_id;
  END IF;
  RETURN old;
END
$$;

DROP TRIGGER IF EXISTS trg_move_out_deleted ON move_outs;
CREATE TRIGGER trg_move_out_deleted
  BEFORE DELETE ON move_outs
  FOR EACH ROW
  EXECUTE FUNCTION on_move_out_deleted();
