-- Migration 59: Add DELETE policy for move_outs
-- Previously missing — RLS silently blocked deletes, appearing to succeed but leaving records intact.
-- Rules:
--   draft            → any operational staff can delete (own cancel)
--   pending_accounting → head_staff / super_admin only

CREATE POLICY "move_outs_delete" ON move_outs
  FOR DELETE USING (
    (status = 'draft'              AND is_operational())
    OR
    (status = 'pending_accounting' AND (is_super_admin() OR is_head_staff()))
  );
