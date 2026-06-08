-- =====================================================================
-- Migration 07: Security hardening, schema fixes, UX improvements
-- =====================================================================

-- =====================================================================
-- 1. SECURE decrypt_id_card — restrict to authenticated only
--    (raw ciphertext API stays but can't be called from browser directly)
-- =====================================================================
revoke all on function decrypt_id_card(bytea) from public;
grant execute on function decrypt_id_card(bytea) to authenticated;

-- =====================================================================
-- 2. New safe RPC: decrypt_tenant_id_card(tenant_id)
--    Role check + fetches ciphertext server-side (no ciphertext to browser)
-- =====================================================================
create or replace function decrypt_tenant_id_card(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encrypted bytea;
begin
  if current_user_role() not in ('super_admin', 'head_staff', 'staff') then
    raise exception 'permission denied';
  end if;
  select id_card_encrypted into v_encrypted from tenants where id = p_tenant_id;
  if v_encrypted is null then return null; end if;
  return decrypt_id_card(v_encrypted);
end $$;

revoke all on function decrypt_tenant_id_card(uuid) from public;
grant execute on function decrypt_tenant_id_card(uuid) to authenticated;

-- =====================================================================
-- 3. Add role check to set_tenant_id_card
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
-- 4. approve_contract — atomic RPC: approve + generate initial invoice
-- =====================================================================
create or replace function approve_contract(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status contract_status;
  v_invoice_id uuid;
begin
  if current_user_role() not in ('super_admin', 'executive') then
    raise exception 'permission denied: executive role required';
  end if;

  select status into v_status from contracts where id = p_contract_id;
  if not found then
    raise exception 'contract not found';
  end if;
  if v_status != 'pending_approve' then
    raise exception 'contract is not pending_approve (current: %)', v_status;
  end if;

  update contracts set status = 'approved', updated_at = now() where id = p_contract_id;
  v_invoice_id := generate_contract_initial_invoice(p_contract_id);
  return v_invoice_id;
end $$;

revoke all on function approve_contract(uuid) from public;
grant execute on function approve_contract(uuid) to authenticated;

-- =====================================================================
-- 5. Unique partial index on id_card_hash (duplicate ID card detection)
-- =====================================================================
create unique index if not exists idx_tenants_id_card_hash_unique
  on tenants(id_card_hash) where id_card_hash is not null;

-- =====================================================================
-- 6. CHECK constraints on money + size fields
-- =====================================================================
alter table rooms
  add constraint chk_base_rent_positive    check (base_rent    >= 0),
  add constraint chk_base_deposit_positive check (base_deposit >= 0),
  add constraint chk_base_advance_positive check (base_advance >= 0),
  add constraint chk_size_sqm_positive     check (size_sqm     > 0 or size_sqm is null);

-- =====================================================================
-- 7. Trigger: sync buildings.total_rentable_rooms on room changes
-- =====================================================================
create or replace function sync_building_room_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update buildings
      set total_rentable_rooms = (
        select count(*) from rooms where building_id = old.building_id and is_rentable = true
      )
    where id = old.building_id;
  elsif tg_op = 'INSERT' then
    update buildings
      set total_rentable_rooms = (
        select count(*) from rooms where building_id = new.building_id and is_rentable = true
      )
    where id = new.building_id;
  elsif tg_op = 'UPDATE' then
    if old.building_id is distinct from new.building_id then
      update buildings
        set total_rentable_rooms = (
          select count(*) from rooms where building_id = old.building_id and is_rentable = true
        )
      where id = old.building_id;
    end if;
    update buildings
      set total_rentable_rooms = (
        select count(*) from rooms where building_id = new.building_id and is_rentable = true
      )
    where id = new.building_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_building_room_count on rooms;
create trigger trg_sync_building_room_count
  after insert or update or delete on rooms
  for each row execute function sync_building_room_count();

-- Backfill current counts
update buildings b
  set total_rentable_rooms = (
    select count(*) from rooms r where r.building_id = b.id and r.is_rentable = true
  );

-- =====================================================================
-- 8. room_types: add building_id (per-building room types)
--    Drop global unique(name); add unique(building_id, name) NULLS NOT DISTINCT
--    (global types keep building_id = NULL)
-- =====================================================================
alter table room_types add column if not exists building_id uuid references buildings(id) on delete cascade;

-- Drop old unique constraint on name alone
alter table room_types drop constraint if exists room_types_name_key;

-- New unique: unique name per building (nulls treated as equal, so two global 'Studio' conflict)
create unique index if not exists room_types_building_name_key
  on room_types(building_id, name) nulls not distinct;

-- =====================================================================
-- 9. Storage object RLS policies for all 5 private buckets
--    Policies: authenticated read, operational insert/delete
-- =====================================================================

-- tenant-docs
create policy "tenant_docs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'tenant-docs');

create policy "tenant_docs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-docs' and is_staff_or_above());

create policy "tenant_docs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-docs' and is_operational());

-- owner-docs
create policy "owner_docs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'owner-docs');

create policy "owner_docs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'owner-docs' and is_staff_or_above());

create policy "owner_docs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'owner-docs' and is_operational());

-- payment-slips
create policy "payment_slips_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-slips');

create policy "payment_slips_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-slips' and is_staff_or_above());

create policy "payment_slips_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-slips' and (is_super_admin() or is_accounting()));

-- contract-pdfs
create policy "contract_pdfs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'contract-pdfs');

create policy "contract_pdfs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contract-pdfs' and is_staff_or_above());

create policy "contract_pdfs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contract-pdfs' and is_operational());

-- maintenance-photos
create policy "maintenance_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'maintenance-photos');

create policy "maintenance_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'maintenance-photos' and is_staff_or_above());

create policy "maintenance_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'maintenance-photos' and is_operational());
