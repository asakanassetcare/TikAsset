-- =====================================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================================
-- RLS Matrix:
--   super_admin   : RW everything
--   executive     : R everything, can approve/reject contracts
--   accounting    : R most, RW payments + owner_transfers + settlements + approve move_outs
--   head_staff    : RW operational (rooms, contracts, bookings, maintenance)
--   staff         : RW operational (sees all rooms — per spec)
--
-- Strategy: enable RLS, deny by default, add allow policies per role per action.
-- We use a SECURITY DEFINER helper to read the current user's role,
-- avoiding infinite recursion on profiles policies.
-- =====================================================================

-- Helper: current role (security definer to bypass RLS on profiles itself)
create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;
revoke all on function current_user_role() from public;
grant execute on function current_user_role() to authenticated;

-- Helper: shorthand
create or replace function is_super_admin() returns boolean
language sql stable as $$ select current_user_role() = 'super_admin' $$;
create or replace function is_executive() returns boolean
language sql stable as $$ select current_user_role() = 'executive' $$;
create or replace function is_accounting() returns boolean
language sql stable as $$ select current_user_role() = 'accounting' $$;
create or replace function is_head_staff() returns boolean
language sql stable as $$ select current_user_role() = 'head_staff' $$;
create or replace function is_staff() returns boolean
language sql stable as $$ select current_user_role() = 'staff' $$;
create or replace function is_staff_or_above() returns boolean
language sql stable as $$
  select current_user_role() in ('super_admin','executive','accounting','head_staff','staff')
$$;
create or replace function is_operational() returns boolean
language sql stable as $$
  select current_user_role() in ('super_admin','head_staff','staff')
$$;

-- =====================================================================
-- Enable RLS on all tables
-- =====================================================================
alter table profiles enable row level security;
alter table settings enable row level security;
alter table projects enable row level security;
alter table buildings enable row level security;
alter table room_types enable row level security;
alter table owners enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table bookings enable row level security;
alter table contracts enable row level security;
alter table contract_versions enable row level security;
alter table contract_checklists enable row level security;
alter table contract_addons enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table owner_transfers enable row level security;
alter table move_outs enable row level security;
alter table settlements enable row level security;
alter table maintenance_requests enable row level security;
alter table documents enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

-- =====================================================================
-- PROFILES
-- =====================================================================
create policy "profiles_read_all_authenticated" on profiles
  for select using (auth.uid() is not null);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_super_admin_all" on profiles
  for all using (is_super_admin()) with check (is_super_admin());

-- =====================================================================
-- SETTINGS — super_admin only writes, everyone reads
-- =====================================================================
create policy "settings_read_all" on settings
  for select using (auth.uid() is not null);
create policy "settings_super_admin_write" on settings
  for all using (is_super_admin()) with check (is_super_admin());

-- =====================================================================
-- PROJECTS / BUILDINGS / ROOM_TYPES — read all, write operational
-- =====================================================================
create policy "projects_read" on projects for select using (auth.uid() is not null);
create policy "projects_write" on projects for all
  using (is_operational()) with check (is_operational());

create policy "buildings_read" on buildings for select using (auth.uid() is not null);
create policy "buildings_write" on buildings for all
  using (is_operational()) with check (is_operational());

create policy "room_types_read" on room_types for select using (auth.uid() is not null);
create policy "room_types_write" on room_types for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- OWNERS — read all, write operational
-- =====================================================================
create policy "owners_read" on owners for select using (auth.uid() is not null);
create policy "owners_write" on owners for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- ROOMS — staff sees all
-- =====================================================================
create policy "rooms_read" on rooms for select using (auth.uid() is not null);
create policy "rooms_write" on rooms for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- TENANTS — read all authenticated, write operational
-- =====================================================================
create policy "tenants_read" on tenants for select using (auth.uid() is not null);
create policy "tenants_write" on tenants for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- BOOKINGS — read all, write operational
-- =====================================================================
create policy "bookings_read" on bookings for select using (auth.uid() is not null);
create policy "bookings_write" on bookings for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- CONTRACTS — read all
--   insert/update by operational (staff sets assigned_staff_id = self, head_staff can reassign)
--   executive can update status to approved/rejected
-- =====================================================================
create policy "contracts_read" on contracts for select using (auth.uid() is not null);

create policy "contracts_insert_operational" on contracts
  for insert with check (is_operational());

create policy "contracts_update_operational_or_executive" on contracts
  for update using (
    is_operational() or is_executive()
  ) with check (
    is_operational() or is_executive()
  );

-- =====================================================================
-- CONTRACT VERSIONS / CHECKLISTS / ADDONS — read all, write operational
-- =====================================================================
create policy "contract_versions_read" on contract_versions for select using (auth.uid() is not null);
create policy "contract_versions_write" on contract_versions for all
  using (is_operational()) with check (is_operational());

create policy "contract_checklists_read" on contract_checklists for select using (auth.uid() is not null);
create policy "contract_checklists_write" on contract_checklists for all
  using (is_operational()) with check (is_operational());

create policy "contract_addons_read" on contract_addons for select using (auth.uid() is not null);
create policy "contract_addons_write" on contract_addons for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- INVOICES — read all
--   insert: system (via SECURITY DEFINER functions) or operational
--   update: operational + accounting (status changes)
-- =====================================================================
create policy "invoices_read" on invoices for select using (auth.uid() is not null);

create policy "invoices_insert" on invoices
  for insert with check (is_operational() or is_accounting());

create policy "invoices_update" on invoices
  for update using (is_operational() or is_accounting())
  with check (is_operational() or is_accounting());

create policy "invoice_items_read" on invoice_items for select using (auth.uid() is not null);
create policy "invoice_items_write" on invoice_items for all
  using (is_operational() or is_accounting())
  with check (is_operational() or is_accounting());

-- =====================================================================
-- PAYMENTS — accounting approves; staff records
-- =====================================================================
create policy "payments_read" on payments for select using (auth.uid() is not null);

create policy "payments_insert" on payments
  for insert with check (is_operational() or is_accounting());

create policy "payments_update_accounting" on payments
  for update using (is_accounting() or is_super_admin())
  with check (is_accounting() or is_super_admin());

-- =====================================================================
-- OWNER TRANSFERS — accounting creates + confirms, staff transfers
-- =====================================================================
create policy "owner_transfers_read" on owner_transfers for select using (auth.uid() is not null);

create policy "owner_transfers_insert" on owner_transfers
  for insert with check (is_accounting() or is_super_admin());

create policy "owner_transfers_update" on owner_transfers
  for update using (is_operational() or is_accounting())
  with check (is_operational() or is_accounting());

-- =====================================================================
-- MOVE OUTS — staff creates, accounting approves
-- =====================================================================
create policy "move_outs_read" on move_outs for select using (auth.uid() is not null);

create policy "move_outs_insert" on move_outs
  for insert with check (is_operational());

create policy "move_outs_update" on move_outs
  for update using (is_operational() or is_accounting())
  with check (is_operational() or is_accounting());

-- =====================================================================
-- SETTLEMENTS — staff pays, accounting confirms
-- =====================================================================
create policy "settlements_read" on settlements for select using (auth.uid() is not null);

create policy "settlements_insert" on settlements
  for insert with check (is_operational() or is_accounting());

create policy "settlements_update" on settlements
  for update using (is_operational() or is_accounting())
  with check (is_operational() or is_accounting());

-- =====================================================================
-- MAINTENANCE — read all, write operational
-- =====================================================================
create policy "maintenance_read" on maintenance_requests for select using (auth.uid() is not null);
create policy "maintenance_write" on maintenance_requests for all
  using (is_operational()) with check (is_operational());

-- =====================================================================
-- DOCUMENTS — read all, write all authenticated
-- =====================================================================
create policy "documents_read" on documents for select using (auth.uid() is not null);
create policy "documents_write" on documents for all
  using (is_staff_or_above()) with check (is_staff_or_above());

-- =====================================================================
-- NOTIFICATIONS — recipient sees own
-- =====================================================================
create policy "notifications_read_own" on notifications
  for select using (recipient_id = auth.uid() or is_super_admin());

create policy "notifications_update_own" on notifications
  for update using (recipient_id = auth.uid() or is_super_admin())
  with check (recipient_id = auth.uid() or is_super_admin());

-- system inserts via SECURITY DEFINER functions; allow operational too
create policy "notifications_insert" on notifications
  for insert with check (is_staff_or_above());

-- =====================================================================
-- ACTIVITY LOGS — read all authenticated, no manual write (trigger only)
-- =====================================================================
create policy "activity_logs_read" on activity_logs
  for select using (is_super_admin() or is_executive() or is_head_staff() or is_accounting());

-- inserts happen via SECURITY DEFINER trigger; deny direct writes
-- (no insert/update/delete policy = denied)
