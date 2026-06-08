-- Migration 82: soft-disable user accounts while preserving profile history.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS disabled_reason text;

CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM profiles
  WHERE id = auth.uid()
    AND is_active = true
$$;

REVOKE ALL ON FUNCTION current_user_role() FROM public;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION create_profile_for_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role user_role,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  v_caller_role := current_user_role();

  IF v_caller_role = 'super_admin' THEN
    IF p_role = 'super_admin' THEN
      RAISE EXCEPTION 'Cannot create super_admin from this form';
    END IF;
  ELSIF v_caller_role = 'head_staff' THEN
    IF p_role NOT IN ('head_staff', 'staff', 'service') THEN
      RAISE EXCEPTION 'head_staff can only create operational users';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission denied';
  END IF;

  INSERT INTO profiles(id, email, full_name, role, phone, is_active, disabled_at, disabled_by, disabled_reason)
  VALUES (p_user_id, p_email, p_full_name, p_role, p_phone, true, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone,
    is_active = true,
    disabled_at = NULL,
    disabled_by = NULL,
    disabled_reason = NULL;
END $$;

REVOKE ALL ON FUNCTION create_profile_for_user(uuid, text, text, user_role, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_profile_for_user(uuid, text, text, user_role, text) TO authenticated;

CREATE OR REPLACE FUNCTION set_user_active(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role user_role;
  v_target_role user_role;
BEGIN
  v_caller_role := current_user_role();

  SELECT role INTO v_target_role
  FROM profiles
  WHERE id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own active status';
  END IF;

  IF v_caller_role = 'super_admin' THEN
    IF v_target_role = 'super_admin' THEN
      RAISE EXCEPTION 'Cannot change super_admin active status from this form';
    END IF;
  ELSIF v_caller_role = 'head_staff' THEN
    IF v_target_role NOT IN ('head_staff', 'staff', 'service') THEN
      RAISE EXCEPTION 'head_staff can only manage operational users';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE profiles
  SET is_active = p_is_active,
      disabled_at = CASE WHEN p_is_active THEN NULL ELSE now() END,
      disabled_by = CASE WHEN p_is_active THEN NULL ELSE auth.uid() END,
      disabled_reason = CASE WHEN p_is_active THEN NULL ELSE NULLIF(TRIM(p_reason), '') END
  WHERE id = p_user_id;
END $$;

REVOKE ALL ON FUNCTION set_user_active(uuid, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_user_active(uuid, boolean, text) TO authenticated;
