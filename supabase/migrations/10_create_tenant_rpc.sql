-- =====================================================================
-- Migration 10: ID card encryption setup + atomic create_tenant RPC
-- Run order: 01 → 03 → 07 → 10
-- =====================================================================

-- =====================================================================
-- 1. Encryption key
--    ALTER DATABASE not allowed on Supabase Cloud → use settings table.
--    Key is read by get_encryption_key() in 03_triggers_functions.sql.
--    WARNING: keep this key consistent across environments; changing it
--    makes all existing encrypted id_card data unreadable.
-- =====================================================================
insert into settings (key, value)
values ('_encryption', jsonb_build_object('key', '58a4f5ae39a2e683a547f3bfea5f58909a597e3fad26b184385abf507673cce2'))
on conflict (key) do update set value = excluded.value;

-- =====================================================================
-- 2. Fix set_tenant_id_card: add extensions to search_path so that
--    digest() from pgcrypto (installed in extensions schema) is visible.
-- =====================================================================
create or replace function set_tenant_id_card(p_tenant_id uuid, p_id_card text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if current_user_role() not in ('super_admin', 'head_staff', 'staff') then
    raise exception 'permission denied';
  end if;
  if p_id_card is null or p_id_card = '' then
    update tenants set id_card_encrypted = null, id_card_last4 = null, id_card_hash = null
      where id = p_tenant_id;
    return;
  end if;
  update tenants set
    id_card_encrypted = encrypt_id_card(p_id_card),
    id_card_last4     = right(p_id_card, 4),
    id_card_hash      = encode(digest(p_id_card, 'sha256'), 'hex')
  where id = p_tenant_id;
end $$;

revoke all on function set_tenant_id_card(uuid, text) from public;
grant execute on function set_tenant_id_card(uuid, text) to authenticated;

-- =====================================================================
-- 3. Atomic create_tenant RPC
--    Checks duplicate ID card hash BEFORE inserting — prevents orphan
--    tenant records when ID card already exists in the system.
-- =====================================================================
create or replace function create_tenant(
  p_full_name               text,
  p_phone                   text,
  p_id_card                 text,
  p_email                   text    default null,
  p_line_id                 text    default null,
  p_address                 text    default null,
  p_emergency_contact_name  text    default null,
  p_emergency_contact_phone text    default null,
  p_vehicle_plate           text    default null,
  p_fingerprint_code        text    default null,
  p_note                    text    default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant_id uuid;
  v_hash      text;
begin
  if current_user_role() not in ('super_admin', 'executive', 'head_staff', 'staff') then
    raise exception 'permission denied';
  end if;

  if p_id_card is null or trim(p_id_card) = '' then
    raise exception 'กรุณากรอกเลขบัตรประชาชน';
  end if;
  if length(trim(p_id_card)) != 13 then
    raise exception 'เลขบัตรประชาชนต้องมี 13 หลัก';
  end if;

  v_hash := encode(digest(trim(p_id_card), 'sha256'), 'hex');
  if exists (select 1 from tenants where id_card_hash = v_hash) then
    raise exception 'เลขบัตรประชาชนนี้มีในระบบแล้ว';
  end if;

  insert into tenants (
    full_name, phone, email, line_id, address,
    emergency_contact_name, emergency_contact_phone,
    vehicle_plate, fingerprint_code, note
  ) values (
    trim(p_full_name), trim(p_phone),
    nullif(trim(coalesce(p_email,'')), ''),
    nullif(trim(coalesce(p_line_id,'')), ''),
    nullif(trim(coalesce(p_address,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_name,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_phone,'')), ''),
    nullif(trim(coalesce(p_vehicle_plate,'')), ''),
    nullif(trim(coalesce(p_fingerprint_code,'')), ''),
    nullif(trim(coalesce(p_note,'')), '')
  ) returning id into v_tenant_id;

  update tenants set
    id_card_encrypted = encrypt_id_card(trim(p_id_card)),
    id_card_last4     = right(trim(p_id_card), 4),
    id_card_hash      = v_hash
  where id = v_tenant_id;

  return v_tenant_id;
end $$;

revoke all on function create_tenant(text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function create_tenant(text,text,text,text,text,text,text,text,text,text,text) to authenticated;
