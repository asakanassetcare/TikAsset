-- Migration 20: Functions and RLS policies for 'service' role
-- Run AFTER migration 19 is committed

CREATE OR REPLACE FUNCTION is_service() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT current_user_role() = 'service' $$;

CREATE OR REPLACE FUNCTION is_staff_or_above() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_user_role() IN ('super_admin','executive','accounting','head_staff','staff','service')
$$;

-- Allow service to read & write maintenance requests
DROP POLICY IF EXISTS "maintenance_write" ON maintenance_requests;
CREATE POLICY "maintenance_write" ON maintenance_requests FOR ALL
  USING  (is_operational() OR is_service())
  WITH CHECK (is_operational() OR is_service());
