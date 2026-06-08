-- ============================================================================
-- Migration 23: Remove broad authenticated storage policies
--
-- Migration 07 owns the role-aware storage.objects policies. Older copies of
-- migration 14 added auth_select/auth_insert/auth_delete policies that allowed
-- every authenticated user to read, upload, and delete across app buckets.
-- ============================================================================

DO $$
DECLARE
  b text;
  policy_suffix text;
BEGIN
  FOREACH b IN ARRAY ARRAY[
    'contract-pdfs',
    'tenant-docs',
    'owner-docs',
    'payment-slips',
    'maintenance-photos'
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
END
$$;
