-- ============================================================
-- Migration 14: Storage Buckets + RLS Policies
-- ============================================================

-- Create private buckets (signed URLs only — no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('contract-pdfs',      'contract-pdfs',      false, 10485760,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('tenant-docs',        'tenant-docs',        false, 10485760,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('owner-docs',         'owner-docs',         false, 10485760,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('payment-slips',      'payment-slips',      false,  5242880,
    ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('maintenance-photos', 'maintenance-photos', false, 10485760,
    ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Migration 07 already defines role-aware storage.object policies for these
-- buckets. Keep this migration responsible for bucket creation only, and remove
-- the broad authenticated policies if an older copy of migration 14 created
-- them in this database.
DO $$
DECLARE
  b text;
  policy_suffix text;
BEGIN
  FOREACH b IN ARRAY ARRAY[
    'contract-pdfs','tenant-docs','owner-docs',
    'payment-slips','maintenance-photos'
  ] LOOP
    policy_suffix := replace(b, '-', '_');

    EXECUTE format(
      'DROP POLICY IF EXISTS "auth_select_%s" ON storage.objects',
      policy_suffix
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "auth_insert_%s" ON storage.objects',
      policy_suffix
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "auth_delete_%s" ON storage.objects',
      policy_suffix
    );
  END LOOP;
END $$;
