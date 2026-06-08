-- Migration 33: Support foreign tenants (passport instead of Thai ID card)
--   1. Add is_foreigner column to tenants
--   2. Replace create_tenant with new signature that includes p_is_foreigner
--      and validates passport (any 2-20 alphanum) vs Thai ID (13 digits only)

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_foreigner boolean NOT NULL DEFAULT false;

-- Drop old 10-text-param version before creating new one
DROP FUNCTION IF EXISTS create_tenant(text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION create_tenant(
  p_full_name               text,
  p_phone                   text,
  p_id_card                 text,
  p_is_foreigner            boolean default false,
  p_email                   text    default null,
  p_line_id                 text    default null,
  p_address                 text    default null,
  p_emergency_contact_name  text    default null,
  p_emergency_contact_phone text    default null,
  p_vehicle_plate           text    default null,
  p_note                    text    default null
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id uuid;
  v_hash      text;
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'executive', 'head_staff', 'staff') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_id_card IS NULL OR trim(p_id_card) = '' THEN
    RAISE EXCEPTION 'กรุณากรอกเลขบัตรประชาชน';
  END IF;

  IF p_is_foreigner THEN
    IF length(trim(p_id_card)) < 2 OR length(trim(p_id_card)) > 20 THEN
      RAISE EXCEPTION 'เลขหนังสือเดินทางไม่ถูกต้อง (2-20 ตัวอักษร)';
    END IF;
  ELSE
    IF length(trim(p_id_card)) != 13 OR trim(p_id_card) !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'เลขบัตรประชาชนต้องมี 13 หลัก';
    END IF;
  END IF;

  v_hash := encode(digest(trim(p_id_card), 'sha256'), 'hex');
  IF EXISTS (SELECT 1 FROM tenants WHERE id_card_hash = v_hash) THEN
    RAISE EXCEPTION 'เลขบัตรประชาชนนี้มีในระบบแล้ว';
  END IF;

  INSERT INTO tenants (
    full_name, phone, email, line_id, address,
    emergency_contact_name, emergency_contact_phone,
    vehicle_plate, note, is_foreigner
  ) VALUES (
    trim(p_full_name), trim(p_phone),
    nullif(trim(coalesce(p_email,'')), ''),
    nullif(trim(coalesce(p_line_id,'')), ''),
    nullif(trim(coalesce(p_address,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_name,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_phone,'')), ''),
    nullif(trim(coalesce(p_vehicle_plate,'')), ''),
    nullif(trim(coalesce(p_note,'')), ''),
    p_is_foreigner
  ) RETURNING id INTO v_tenant_id;

  UPDATE tenants SET
    id_card_encrypted = encrypt_id_card(trim(p_id_card)),
    id_card_last4     = right(trim(p_id_card), 4),
    id_card_hash      = v_hash
  WHERE id = v_tenant_id;

  RETURN v_tenant_id;
END
$$;

REVOKE ALL ON FUNCTION create_tenant(text,text,text,boolean,text,text,text,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_tenant(text,text,text,boolean,text,text,text,text,text,text,text) TO authenticated;
