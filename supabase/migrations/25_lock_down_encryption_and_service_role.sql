-- ============================================================================
-- Migration 25: Lock down encryption data and service role access
-- ============================================================================

-- Do not expose the application encryption key through normal settings reads.
DROP POLICY IF EXISTS "settings_read_all" ON settings;
DROP POLICY IF EXISTS "settings_read_non_secret" ON settings;

CREATE POLICY "settings_read_non_secret" ON settings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND current_user_role() <> 'service'
    AND key <> '_encryption'
  );

-- Raw ciphertext decryption must not be callable from the browser. Clients
-- should use decrypt_tenant_id_card(tenant_id), which performs its own role
-- check and only decrypts data owned by a tenant row.
REVOKE ALL ON FUNCTION decrypt_id_card(bytea) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION decrypt_id_card(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'head_staff', 'staff') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := get_encryption_key();
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;

  RETURN pgp_sym_decrypt(p_encrypted, v_key);
END
$$;

CREATE OR REPLACE FUNCTION decrypt_tenant_id_card(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encrypted bytea;
  v_key text;
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'head_staff', 'staff') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT id_card_encrypted
    INTO v_encrypted
    FROM tenants
   WHERE id = p_tenant_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := get_encryption_key();
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;

  RETURN pgp_sym_decrypt(v_encrypted, v_key);
END
$$;

REVOKE ALL ON FUNCTION decrypt_tenant_id_card(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION decrypt_tenant_id_card(uuid) TO authenticated;

-- Keep service out of generic staff-level access. Service-specific access must
-- be granted explicitly.
CREATE OR REPLACE FUNCTION is_staff_or_above() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT current_user_role() IN ('super_admin','executive','accounting','head_staff','staff')
$$;

-- Service users should work in maintenance, not browse operational records by
-- direct URL or API calls. Maintenance-specific policies remain in migration 20.
DROP POLICY IF EXISTS "rooms_read" ON rooms;
CREATE POLICY "rooms_read" ON rooms
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "tenants_read" ON tenants;
CREATE POLICY "tenants_read" ON tenants
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "projects_read" ON projects;
CREATE POLICY "projects_read" ON projects
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "buildings_read" ON buildings;
CREATE POLICY "buildings_read" ON buildings
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "owners_read" ON owners;
CREATE POLICY "owners_read" ON owners
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "bookings_read" ON bookings;
CREATE POLICY "bookings_read" ON bookings
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "contracts_read" ON contracts;
CREATE POLICY "contracts_read" ON contracts
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "invoices_read" ON invoices;
CREATE POLICY "invoices_read" ON invoices
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "payments_read" ON payments;
CREATE POLICY "payments_read" ON payments
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "owner_transfers_read" ON owner_transfers;
CREATE POLICY "owner_transfers_read" ON owner_transfers
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "move_outs_read" ON move_outs;
CREATE POLICY "move_outs_read" ON move_outs
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "settlements_read" ON settlements;
CREATE POLICY "settlements_read" ON settlements
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "documents_read" ON documents;
CREATE POLICY "documents_read" ON documents
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() <> 'service');

DROP POLICY IF EXISTS "documents_service_maintenance_read" ON documents;
CREATE POLICY "documents_service_maintenance_read" ON documents
  FOR SELECT
  USING (
    current_user_role() = 'service'
    AND ref_table = 'maintenance_requests'
    AND doc_type IN ('maintenance_before', 'maintenance_after')
  );

DROP POLICY IF EXISTS "documents_service_maintenance_insert" ON documents;
CREATE POLICY "documents_service_maintenance_insert" ON documents
  FOR INSERT
  WITH CHECK (
    current_user_role() = 'service'
    AND ref_table = 'maintenance_requests'
    AND doc_type IN ('maintenance_before', 'maintenance_after')
  );

DROP POLICY IF EXISTS "maintenance_photos_insert" ON storage.objects;
CREATE POLICY "maintenance_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-photos'
    AND (is_staff_or_above() OR current_user_role() = 'service')
  );
