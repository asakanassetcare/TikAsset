-- =====================================================================
-- Migration 13: room_fingerprints table
--   fingerprint_code is a room access code (door scanner), not tenant data.
--   One room can have multiple codes. Replaced by staff after move-out.
-- =====================================================================

-- 1. Create room_fingerprints table
create table room_fingerprints (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references rooms(id) on delete cascade,
  code       text not null,
  label      text,             -- e.g. "ลายนิ้วมือซ้าย", "สำรอง"
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_room_fingerprints_room on room_fingerprints(room_id);

-- RLS
alter table room_fingerprints enable row level security;

create policy "fp_read" on room_fingerprints
  for select to authenticated using (true);

create policy "fp_insert" on room_fingerprints
  for insert to authenticated
  with check (is_staff_or_above());

create policy "fp_delete" on room_fingerprints
  for delete to authenticated
  using (is_staff_or_above());

-- 2. Drop fingerprint_code from tenants (belongs to room, not person)
alter table tenants drop column if exists fingerprint_code;

-- 3. Drop fingerprint_code from contracts (already removed in migration 12,
--    this is a safety net)
alter table contracts drop column if exists fingerprint_code;

-- 4. Redefine create_tenant without p_fingerprint_code parameter
drop function if exists create_tenant(text,text,text,text,text,text,text,text,text,text,text);

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
    vehicle_plate, note
  ) values (
    trim(p_full_name), trim(p_phone),
    nullif(trim(coalesce(p_email,'')), ''),
    nullif(trim(coalesce(p_line_id,'')), ''),
    nullif(trim(coalesce(p_address,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_name,'')), ''),
    nullif(trim(coalesce(p_emergency_contact_phone,'')), ''),
    nullif(trim(coalesce(p_vehicle_plate,'')), ''),
    nullif(trim(coalesce(p_note,'')), '')
  ) returning id into v_tenant_id;

  update tenants set
    id_card_encrypted = encrypt_id_card(trim(p_id_card)),
    id_card_last4     = right(trim(p_id_card), 4),
    id_card_hash      = v_hash
  where id = v_tenant_id;

  return v_tenant_id;
end $$;

revoke all on function create_tenant(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function create_tenant(text,text,text,text,text,text,text,text,text,text) to authenticated;
