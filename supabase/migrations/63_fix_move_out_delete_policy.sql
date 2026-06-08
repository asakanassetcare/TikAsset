-- Migration 63: Fix move_out delete policy + delete trigger
--
-- Problem: migration 59 only allowed deleting draft/pending_accounting.
-- When an approved (future-dated) move_out was "cancelled" via the UI, RLS
-- silently blocked the DELETE (0 rows deleted, no error), but the frontend
-- navigated away as if it succeeded. The orphaned record then blocks the
-- unique constraint on (contract_id).
--
-- Fix:
--   1. Allow head_staff/super_admin to delete approved move_outs too
--   2. Update on_move_out_deleted trigger to clean up settlement + restore
--      room to occupied when the approved move_out was future-dated

-- ─── 1. Replace delete policy ────────────────────────────────────────────────
DROP POLICY IF EXISTS "move_outs_delete" ON move_outs;

CREATE POLICY "move_outs_delete" ON move_outs
  FOR DELETE USING (
    -- Staff can cancel their own draft
    (status = 'draft' AND is_operational())
    OR
    -- Head staff can cancel pending or approved move-outs
    (status IN ('pending_accounting', 'approved') AND (is_super_admin() OR is_head_staff()))
  );

-- ─── 2. Updated delete trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION on_move_out_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Restore room to occupied only if it was freed (or wasn't freed yet for future dates)
  IF old.status IN ('draft', 'pending_accounting') THEN
    -- Trigger from migration 32 freed the room only if move_out_date <= today,
    -- so just restore unconditionally; the room might already be occupied (no-op harmless).
    UPDATE rooms SET status = 'occupied' WHERE id = old.room_id AND status = 'available';
  END IF;

  IF old.status = 'approved' THEN
    -- For future-dated approved move-outs, the room was never freed — nothing to restore.
    -- For past-dated ones (room was freed + contract closed), restore room to occupied
    -- and reactivate the contract if still possible.
    IF old.move_out_date::date > current_date THEN
      -- Future-dated: room still occupied, just clean up settlement
      NULL;
    ELSE
      -- Past-dated: room was freed — put it back to occupied
      UPDATE rooms SET status = 'occupied' WHERE id = old.room_id AND status = 'available';
    END IF;
  END IF;

  -- Always clean up the settlement record so the constraint is free for re-creation
  DELETE FROM settlements WHERE move_out_id = old.id;

  RETURN old;
END
$$;
