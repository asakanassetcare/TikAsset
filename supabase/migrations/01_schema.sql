-- =====================================================================
-- Condo Rental Management — Phase 1 Schema
-- Postgres 15+ / Supabase
-- All money columns: NUMERIC(12,2)
-- All timestamps: TIMESTAMPTZ (UTC), display in Asia/Bangkok via app
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- =====================================================================
-- ENUMS
-- =====================================================================
create type user_role as enum (
  'super_admin', 'executive', 'accounting', 'head_staff', 'staff'
);

create type room_status as enum (
  'available', 'occupied', 'reserved', 'maintenance', 'blocked'
);

create type room_ownership as enum ('owned', 'managed'); -- owned = ของบริษัท / managed = ฝากบริหาร

create type booking_status as enum (
  'waiting', 'converted', 'cancelled'
);

create type booking_deposit_action as enum (
  'kept', 'refunded'  -- ยึด / คืน (เมื่อ cancelled)
);

create type contract_status as enum (
  'pending_approve',  -- staff ส่งให้ executive
  'approved',         -- executive อนุมัติ ยังไม่เข้าพัก
  'active',           -- ผู้เช่ากดเข้าพักแล้ว
  'expired',          -- หมดสัญญาตามปกติ
  'terminated',       -- ยกเลิกก่อนกำหนด
  'rejected',         -- executive ปฏิเสธ
  'cancelled'         -- staff ยกเลิกก่อนส่งหรือก่อน approve
);

create type invoice_status as enum (
  'pending',                -- รอจ่าย
  'paid_pending_approve',   -- ผู้เช่าแนบสลิป รอบัญชีอนุมัติ (phase 2)
  'paid',                   -- บัญชีอนุมัติแล้ว
  'overdue',                -- เลย due date
  'cancelled',              -- บัญชีปฏิเสธสลิปปลอม / staff ยกเลิก
  'rejected'                -- บัญชี reject สลิป
);

create type invoice_type as enum (
  'contract_initial',  -- เงินประกัน + ค่าเช่าล่วงหน้า (ตอนทำสัญญา)
  'monthly_rent',      -- ค่าเช่ารายเดือน
  'addon',             -- ค่า add-on ที่ออกแยก
  'final_settlement',  -- เคลียร์เงินตอน move-out
  'booking_deposit',   -- เงินจอง
  'other'
);

create type payment_status as enum (
  'pending_approve', 'approved', 'rejected'
);

create type addon_billing_cycle as enum ('monthly', 'yearly', 'one_time');

create type move_out_status as enum (
  'pending_accounting',  -- staff สร้าง รอบัญชีอนุมัติ
  'approved',            -- บัญชีอนุมัติ ห้องว่างแล้ว
  'settled'              -- เคลียร์เงินคืน/หักครบแล้ว
);

create type settlement_status as enum (
  'pending',          -- รอ staff โอนเงินคืน
  'paid_by_staff',    -- staff โอนแล้ว แนบสลิป รอบัญชียืนยัน
  'completed',        -- บัญชียืนยัน
  'rejected'          -- บัญชีปฏิเสธ
);

create type maintenance_status as enum (
  'reported', 'in_progress', 'completed', 'cancelled'
);

create type document_type as enum (
  'id_card_front', 'id_card_back', 'vehicle_registration',
  'contract_pdf', 'contract_addendum',
  'payment_slip', 'owner_transfer_slip', 'settlement_slip',
  'maintenance_before', 'maintenance_after',
  'owner_document', 'other'
);

create type notification_type as enum (
  'contract_pending_approve', 'contract_approved', 'contract_rejected',
  'invoice_generated', 'payment_slip_uploaded', 'payment_overdue',
  'contract_expiring',
  'maintenance_new', 'maintenance_completed',
  'move_out_pending', 'settlement_overdue',
  'owner_transfer_pending', 'owner_transfer_confirmed'
);

create type audit_action as enum ('insert', 'update', 'delete');

-- =====================================================================
-- HELPER: updated_at trigger
-- =====================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- PROFILES (linked to auth.users)
-- =====================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text unique not null,
  full_name text not null,
  phone text,
  role user_role not null default 'staff',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create index idx_profiles_role on profiles(role);

-- =====================================================================
-- SETTINGS (singleton key-value)
-- =====================================================================
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create trigger trg_settings_updated before update on settings
  for each row execute function set_updated_at();

-- =====================================================================
-- PROJECTS / BUILDINGS / ROOM TYPES / ROOMS
-- =====================================================================
create table projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

create table buildings (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete restrict,
  name text not null,
  total_floors int not null default 1,
  total_rentable_rooms int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);
create trigger trg_buildings_updated before update on buildings
  for each row execute function set_updated_at();
create index idx_buildings_project on buildings(project_id);

create table room_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,           -- Studio, 1BR, 2BR, ...
  description text,
  default_size_sqm numeric(6,2),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- OWNERS (เจ้าของห้องฝากบริหาร)
-- =====================================================================
create table owners (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text,
  line_id text,
  email text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_owners_updated before update on owners
  for each row execute function set_updated_at();

-- =====================================================================
-- ROOMS
-- =====================================================================
create table rooms (
  id uuid primary key default uuid_generate_v4(),
  building_id uuid not null references buildings(id) on delete restrict,
  room_number text not null,
  floor int not null,
  room_type_id uuid references room_types(id),
  size_sqm numeric(6,2),

  -- pricing baseline (ใช้เป็น default ตอนสร้างสัญญา)
  base_rent numeric(12,2) not null default 0,
  base_deposit numeric(12,2) not null default 0,
  base_advance numeric(12,2) not null default 0,

  -- meter numbers (current เอาไว้อ้างอิง — meter snapshot ที่ใช้จริงเก็บใน contract)
  electric_meter_number text,
  water_meter_number text,

  -- ownership
  ownership room_ownership not null default 'owned',
  owner_id uuid references owners(id),

  -- status
  status room_status not null default 'available',
  is_rentable boolean not null default true,  -- toggle ปิด/เปิดปล่อยเช่า
  status_color text,                          -- override default color
  internal_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (building_id, room_number),
  -- managed room must have owner
  constraint chk_managed_owner check (
    (ownership = 'managed' and owner_id is not null) or
    (ownership = 'owned' and owner_id is null)
  )
);
create trigger trg_rooms_updated before update on rooms
  for each row execute function set_updated_at();
create index idx_rooms_building on rooms(building_id);
create index idx_rooms_status on rooms(status);
create index idx_rooms_ownership on rooms(ownership);
create index idx_rooms_owner on rooms(owner_id);

-- =====================================================================
-- TENANTS (ไม่มีลบ — เก็บประวัติทั้งหมด)
-- =====================================================================
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text not null,
  email text,
  line_id text,

  -- เลขบัตร ปชช. — encrypted ด้วย pgcrypto
  -- เก็บ ciphertext + เก็บ last4 plain เผื่อใช้ค้นหา/แสดง
  id_card_encrypted bytea,           -- pgp_sym_encrypt result
  id_card_last4 text,                -- '1234' สำหรับแสดงผล/ค้นหา
  id_card_hash text,                 -- sha256(id_card) for unique check

  address text,
  emergency_contact_name text,
  emergency_contact_phone text,

  vehicle_plate text,
  fingerprint_code text,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated before update on tenants
  for each row execute function set_updated_at();
create index idx_tenants_phone on tenants(phone);
create index idx_tenants_id_hash on tenants(id_card_hash);
create index idx_tenants_full_name on tenants(full_name);

-- =====================================================================
-- BOOKINGS (1 ห้อง active ได้แค่ 1)
-- =====================================================================
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  booking_number text unique not null,   -- BK-2026-00001
  room_id uuid not null references rooms(id),
  tenant_id uuid not null references tenants(id),
  deposit_amount numeric(12,2) not null default 0,
  status booking_status not null default 'waiting',

  -- cancellation
  cancelled_at timestamptz,
  cancelled_by uuid references profiles(id),
  deposit_action booking_deposit_action,   -- เมื่อ cancelled
  cancel_reason text,

  -- conversion
  converted_to_contract_id uuid,           -- set ตอน convert
  converted_at timestamptz,

  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();
create unique index uq_bookings_active_per_room on bookings(room_id)
  where status = 'waiting';
create index idx_bookings_status on bookings(status);
create index idx_bookings_tenant on bookings(tenant_id);

-- =====================================================================
-- CONTRACTS
-- =====================================================================
create table contracts (
  id uuid primary key default uuid_generate_v4(),
  contract_number text unique not null,    -- CT-2026-00001
  room_id uuid not null references rooms(id),
  tenant_id uuid not null references tenants(id),
  booking_id uuid references bookings(id),   -- nullable
  previous_contract_id uuid references contracts(id),  -- for renewal

  -- dates
  contract_start_date date not null,
  contract_end_date date not null,
  move_in_date date not null,                -- กำหนดตอนทำสัญญา
  actual_move_in_at timestamptz,             -- ตอน staff กด "เข้าพัก"
  actual_move_out_at timestamptz,            -- ตอน staff กด "ย้ายออก"

  -- money
  monthly_rent numeric(12,2) not null,
  deposit_amount numeric(12,2) not null,
  advance_rent_amount numeric(12,2) not null,
  booking_deposit_applied numeric(12,2) not null default 0,  -- หักจาก booking
  payment_day int not null default 1 check (payment_day between 1 and 28),  -- จ่ายทุกวันที่

  -- meter snapshots (เริ่มสัญญา)
  electric_meter_start numeric(12,2),
  water_meter_start numeric(12,2),
  electric_meter_end numeric(12,2),
  water_meter_end numeric(12,2),

  vehicle_plate text,
  fingerprint_code text,

  -- assignment + workflow
  assigned_staff_id uuid not null references profiles(id),  -- ผู้ดูแลห้องนี้
  status contract_status not null default 'pending_approve',

  submitted_for_approval_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  rejected_at timestamptz,
  rejected_by uuid references profiles(id),
  rejection_reason text,
  terminated_at timestamptz,
  termination_reason text,

  -- management fee (สำหรับห้องฝากบริหาร) — เก็บครั้งเดียวต่อสัญญา
  management_fee_amount numeric(12,2) not null default 0,
  management_fee_collected_at timestamptz,

  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contracts_updated before update on contracts
  for each row execute function set_updated_at();
create unique index uq_contracts_active_per_room on contracts(room_id)
  where status in ('pending_approve','approved','active');
create index idx_contracts_room on contracts(room_id);
create index idx_contracts_tenant on contracts(tenant_id);
create index idx_contracts_status on contracts(status);
create index idx_contracts_end_date on contracts(contract_end_date);
create index idx_contracts_assigned on contracts(assigned_staff_id);

alter table bookings
  add constraint fk_bookings_converted_contract
  foreign key (converted_to_contract_id) references contracts(id);

-- =====================================================================
-- CONTRACT VERSIONS (ทุกครั้งที่อัพแบบฟอร์มสัญญาใหม่)
-- =====================================================================
create table contract_versions (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete restrict,
  version int not null,
  pdf_url text not null,
  note text,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);
create index idx_contract_versions_contract on contract_versions(contract_id);

-- =====================================================================
-- CONTRACT CHECKLISTS (สภาพห้องเข้า/ออก)
-- =====================================================================
create table contract_checklists (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete restrict,
  phase text not null check (phase in ('move_in', 'move_out')),
  items jsonb not null default '[]',  -- [{name, condition, note, photo_url}]
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (contract_id, phase)
);
create index idx_checklists_contract on contract_checklists(contract_id);

-- =====================================================================
-- CONTRACT ADDONS (ค่าจอด, ค่าเฟอร์, อินเทอร์เน็ต, ...)
-- =====================================================================
create table contract_addons (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete restrict,
  name text not null,
  description text,
  amount numeric(12,2) not null,
  billing_cycle addon_billing_cycle not null default 'monthly',
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_addons_updated before update on contract_addons
  for each row execute function set_updated_at();
create index idx_addons_contract on contract_addons(contract_id);
create index idx_addons_active on contract_addons(contract_id, is_active);

-- =====================================================================
-- INVOICES
-- =====================================================================
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  invoice_number text unique not null,    -- INV-2026-00001
  invoice_type invoice_type not null,
  contract_id uuid references contracts(id),  -- nullable for booking_deposit
  booking_id uuid references bookings(id),    -- nullable
  tenant_id uuid not null references tenants(id),
  room_id uuid not null references rooms(id),

  billing_period text,    -- '2026-05' for monthly_rent (NULL otherwise)
  issue_date date not null default current_date,
  due_date date not null,

  subtotal numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,

  status invoice_status not null default 'pending',

  cancelled_at timestamptz,
  cancelled_by uuid references profiles(id),
  cancellation_reason text,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ห้าม duplicate monthly rent ต่อ contract+period
  unique (contract_id, billing_period, invoice_type)
);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();
create index idx_invoices_contract on invoices(contract_id);
create index idx_invoices_tenant on invoices(tenant_id);
create index idx_invoices_status on invoices(status);
create index idx_invoices_due on invoices(due_date);
create index idx_invoices_room on invoices(room_id);

-- =====================================================================
-- INVOICE ITEMS (รายการในใบแจ้งหนี้)
-- =====================================================================
create table invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  item_type text,        -- 'rent', 'deposit', 'advance', 'addon', 'damage', 'refund', ...
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) not null,
  note text,
  display_order int not null default 0
);
create index idx_invoice_items_invoice on invoice_items(invoice_id);

-- =====================================================================
-- PAYMENTS
-- =====================================================================
create table payments (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id),
  amount numeric(12,2) not null,
  paid_date date not null,
  slip_url text,
  bank_reference text,
  note text,

  status payment_status not null default 'pending_approve',

  recorded_by uuid not null references profiles(id),    -- staff or tenant (phase 2)
  approved_by uuid references profiles(id),             -- accounting
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_payments_updated before update on payments
  for each row execute function set_updated_at();
create index idx_payments_invoice on payments(invoice_id);
create index idx_payments_status on payments(status);

-- =====================================================================
-- OWNER TRANSFERS (โอนค่าเช่าให้เจ้าของห้องฝากบริหาร)
-- =====================================================================
create table owner_transfers (
  id uuid primary key default uuid_generate_v4(),
  transfer_number text unique not null,   -- OT-2026-00001
  owner_id uuid not null references owners(id),
  room_id uuid not null references rooms(id),
  contract_id uuid not null references contracts(id),
  invoice_id uuid not null references invoices(id),    -- linked to specific monthly invoice
  period text not null,                                -- '2026-05'
  rent_collected numeric(12,2) not null,
  transfer_amount numeric(12,2) not null,              -- amount actually transferred
  slip_url text,
  bank_reference text,

  -- 2-step approval
  status text not null default 'pending_staff' check (status in (
    'pending_staff',         -- บัญชีสร้าง, รอ staff โอน
    'transferred_by_staff',  -- staff กดยืนยันแล้ว แนบสลิป
    'confirmed',             -- บัญชี approve final
    'rejected'
  )),
  transferred_by uuid references profiles(id),
  transferred_at timestamptz,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  rejection_reason text,

  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (room_id, period)   -- 1 ห้อง 1 รอบ
);
create trigger trg_owner_transfers_updated before update on owner_transfers
  for each row execute function set_updated_at();
create index idx_owner_transfers_owner on owner_transfers(owner_id);
create index idx_owner_transfers_status on owner_transfers(status);
create index idx_owner_transfers_period on owner_transfers(period);

-- =====================================================================
-- MOVE OUTS
-- =====================================================================
create table move_outs (
  id uuid primary key default uuid_generate_v4(),
  move_out_number text unique not null,   -- MO-2026-00001
  contract_id uuid not null unique references contracts(id),
  room_id uuid not null references rooms(id),
  tenant_id uuid not null references tenants(id),

  move_out_date date not null,
  reason text,
  is_early_termination boolean not null default false,

  electric_meter_end numeric(12,2),
  water_meter_end numeric(12,2),

  -- breakdown
  deposit_amount numeric(12,2) not null,       -- snapshot จาก contract
  repair_cost numeric(12,2) not null default 0,
  penalty_cost numeric(12,2) not null default 0,
  other_deduction numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,   -- = deposit - all deductions (>=0)
  additional_charge numeric(12,2) not null default 0,  -- กรณีเงินประกันไม่พอ ผู้เช่าต้องจ่ายเพิ่ม

  status move_out_status not null default 'pending_accounting',
  settlement_deadline date,   -- = move_out_date + 15 days

  approved_by uuid references profiles(id),    -- accounting
  approved_at timestamptz,

  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_move_outs_updated before update on move_outs
  for each row execute function set_updated_at();
create index idx_move_outs_contract on move_outs(contract_id);
create index idx_move_outs_status on move_outs(status);
create index idx_move_outs_deadline on move_outs(settlement_deadline);

-- =====================================================================
-- SETTLEMENTS (เคลียร์เงินคืนหลัง move-out)
-- =====================================================================
create table settlements (
  id uuid primary key default uuid_generate_v4(),
  move_out_id uuid not null unique references move_outs(id),
  amount numeric(12,2) not null,             -- เงินที่จ่ายคืน (positive)
  direction text not null check (direction in ('refund_to_tenant', 'charge_from_tenant')),
  slip_url text,
  bank_reference text,

  status settlement_status not null default 'pending',

  paid_by_staff uuid references profiles(id),
  paid_at timestamptz,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_settlements_updated before update on settlements
  for each row execute function set_updated_at();
create index idx_settlements_moveout on settlements(move_out_id);
create index idx_settlements_status on settlements(status);

-- =====================================================================
-- MAINTENANCE
-- =====================================================================
create table maintenance_requests (
  id uuid primary key default uuid_generate_v4(),
  maintenance_number text unique not null,   -- MT-2026-00001
  building_id uuid references buildings(id),
  room_id uuid references rooms(id),         -- null = common area
  area_description text,

  title text not null,
  description text,
  reported_by uuid not null references profiles(id),
  reported_at timestamptz not null default now(),

  status maintenance_status not null default 'reported',
  cost numeric(12,2),
  vendor_name text,

  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  cancelled_at timestamptz,
  cancellation_reason text,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_maintenance_updated before update on maintenance_requests
  for each row execute function set_updated_at();
create index idx_maintenance_status on maintenance_requests(status);
create index idx_maintenance_room on maintenance_requests(room_id);
create index idx_maintenance_building on maintenance_requests(building_id);

-- =====================================================================
-- DOCUMENTS (polymorphic)
-- =====================================================================
create table documents (
  id uuid primary key default uuid_generate_v4(),
  ref_table text not null,    -- 'contracts', 'tenants', 'maintenance_requests', ...
  ref_id uuid not null,
  doc_type document_type not null,
  file_url text not null,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  version int not null default 1,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_documents_ref on documents(ref_table, ref_id);
create index idx_documents_type on documents(doc_type);

-- =====================================================================
-- NOTIFICATIONS (in-app)
-- =====================================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  ref_table text,
  ref_id uuid,
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_recipient on notifications(recipient_id, read_at);
create index idx_notifications_created on notifications(created_at desc);

-- =====================================================================
-- ACTIVITY LOG (audit)
-- =====================================================================
create table activity_logs (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action audit_action not null,
  ref_table text not null,
  ref_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  ip_address inet,
  user_agent text,
  context text,                -- optional human-readable
  created_at timestamptz not null default now()
);
create index idx_activity_ref on activity_logs(ref_table, ref_id);
create index idx_activity_actor on activity_logs(actor_id);
create index idx_activity_created on activity_logs(created_at desc);

-- =====================================================================
-- SEQUENCES สำหรับ generate number ปีต่อปี
-- =====================================================================
create sequence if not exists seq_invoice_number;
create sequence if not exists seq_contract_number;
create sequence if not exists seq_booking_number;
create sequence if not exists seq_move_out_number;
create sequence if not exists seq_maintenance_number;
create sequence if not exists seq_owner_transfer_number;
