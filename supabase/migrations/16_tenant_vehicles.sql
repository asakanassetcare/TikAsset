-- Migration 16: Tenant Vehicles (multiple vehicles per tenant)
CREATE TABLE tenant_vehicles (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate_number text       NOT NULL,
  note        text,
  created_by  uuid        REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth select tenant_vehicles"
  ON tenant_vehicles FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff insert tenant_vehicles"
  ON tenant_vehicles FOR INSERT TO authenticated
  WITH CHECK (is_staff_or_above());

CREATE POLICY "staff delete tenant_vehicles"
  ON tenant_vehicles FOR DELETE TO authenticated
  USING (is_staff_or_above());

CREATE INDEX idx_tenant_vehicles_tenant ON tenant_vehicles(tenant_id);
