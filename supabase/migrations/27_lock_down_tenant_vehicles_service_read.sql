-- ============================================================================
-- Migration 27: Keep service role out of tenant vehicle records
-- ============================================================================

DROP POLICY IF EXISTS "auth select tenant_vehicles" ON tenant_vehicles;
DROP POLICY IF EXISTS "tenant_vehicles_read_non_service" ON tenant_vehicles;

CREATE POLICY "tenant_vehicles_read_non_service"
  ON tenant_vehicles FOR SELECT TO authenticated
  USING (current_user_role() <> 'service');
