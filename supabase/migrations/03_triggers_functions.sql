-- =====================================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================================

-- =====================================================================
-- 1. AUDIT LOG — generic trigger for important tables
-- =====================================================================
create or replace function log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_action audit_action;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select array_agg(key) into v_changed
    from jsonb_each(v_new) k
    where v_new->k.key is distinct from v_old->k.key
      and k.key not in ('updated_at');
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_old := to_jsonb(old);
  end if;

  insert into activity_logs(actor_id, action, ref_table, ref_id, old_data, new_data, changed_fields)
  values (
    auth.uid(),
    v_action,
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then (v_old->>'id') else (v_new->>'id') end)::uuid, null),
    v_old,
    v_new,
    v_changed
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- attach to important tables
create trigger trg_audit_rooms after insert or update or delete on rooms
  for each row execute function log_activity();
create trigger trg_audit_owners after insert or update or delete on owners
  for each row execute function log_activity();
create trigger trg_audit_tenants after insert or update or delete on tenants
  for each row execute function log_activity();
create trigger trg_audit_bookings after insert or update or delete on bookings
  for each row execute function log_activity();
create trigger trg_audit_contracts after insert or update or delete on contracts
  for each row execute function log_activity();
create trigger trg_audit_contract_addons after insert or update or delete on contract_addons
  for each row execute function log_activity();
create trigger trg_audit_invoices after insert or update or delete on invoices
  for each row execute function log_activity();
create trigger trg_audit_payments after insert or update or delete on payments
  for each row execute function log_activity();
create trigger trg_audit_move_outs after insert or update or delete on move_outs
  for each row execute function log_activity();
create trigger trg_audit_settlements after insert or update or delete on settlements
  for each row execute function log_activity();
create trigger trg_audit_owner_transfers after insert or update or delete on owner_transfers
  for each row execute function log_activity();
create trigger trg_audit_maintenance after insert or update or delete on maintenance_requests
  for each row execute function log_activity();
create trigger trg_audit_profiles after insert or update or delete on profiles
  for each row execute function log_activity();

-- =====================================================================
-- 2. NUMBER GENERATORS (sequential per year)
-- =====================================================================
create or replace function next_number(prefix text, seq_name text)
returns text
language plpgsql
as $$
declare
  v_year text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY');
  v_seq int;
begin
  v_seq := nextval(seq_name);
  return format('%s-%s-%s', prefix, v_year, lpad(v_seq::text, 5, '0'));
end $$;

-- =====================================================================
-- 3. INVOICE NUMBER auto-fill
-- =====================================================================
create or replace function set_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := next_number('INV', 'seq_invoice_number');
  end if;
  return new;
end $$;
create trigger trg_invoice_number before insert on invoices
  for each row execute function set_invoice_number();

create or replace function set_contract_number()
returns trigger language plpgsql as $$
begin
  if new.contract_number is null or new.contract_number = '' then
    new.contract_number := next_number('CT', 'seq_contract_number');
  end if;
  return new;
end $$;
create trigger trg_contract_number before insert on contracts
  for each row execute function set_contract_number();

create or replace function set_booking_number()
returns trigger language plpgsql as $$
begin
  if new.booking_number is null or new.booking_number = '' then
    new.booking_number := next_number('BK', 'seq_booking_number');
  end if;
  return new;
end $$;
create trigger trg_booking_number before insert on bookings
  for each row execute function set_booking_number();

create or replace function set_move_out_number()
returns trigger language plpgsql as $$
begin
  if new.move_out_number is null or new.move_out_number = '' then
    new.move_out_number := next_number('MO', 'seq_move_out_number');
  end if;
  return new;
end $$;
create trigger trg_move_out_number before insert on move_outs
  for each row execute function set_move_out_number();

create or replace function set_maintenance_number()
returns trigger language plpgsql as $$
begin
  if new.maintenance_number is null or new.maintenance_number = '' then
    new.maintenance_number := next_number('MT', 'seq_maintenance_number');
  end if;
  return new;
end $$;
create trigger trg_maintenance_number before insert on maintenance_requests
  for each row execute function set_maintenance_number();

create or replace function set_owner_transfer_number()
returns trigger language plpgsql as $$
begin
  if new.transfer_number is null or new.transfer_number = '' then
    new.transfer_number := next_number('OT', 'seq_owner_transfer_number');
  end if;
  return new;
end $$;
create trigger trg_owner_transfer_number before insert on owner_transfers
  for each row execute function set_owner_transfer_number();

-- =====================================================================
-- 4. INVOICE TOTAL recalc from items
-- =====================================================================
create or replace function recalc_invoice_total()
returns trigger language plpgsql as $$
declare
  v_invoice_id uuid;
  v_total numeric(12,2);
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(amount), 0) into v_total
  from invoice_items where invoice_id = v_invoice_id;
  update invoices set subtotal = v_total, total_amount = v_total
  where id = v_invoice_id;
  return null;
end $$;

create trigger trg_invoice_items_recalc
  after insert or update or delete on invoice_items
  for each row execute function recalc_invoice_total();

-- =====================================================================
-- 5. ID CARD ENCRYPTION HELPERS
-- =====================================================================
-- Note: settings.encryption_key is set as DB parameter via env in Supabase
-- We use a setting() function that reads from a settings row.
-- Production: store the key outside DB (Supabase Vault).

create or replace function get_encryption_key()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    current_setting('app.encryption_key', true),
    (select value ->> 'key' from settings where key = '_encryption')
  )
$$;

create or replace function encrypt_id_card(p_id_card text)
returns bytea
language plpgsql
security definer
as $$
declare v_key text;
begin
  if p_id_card is null or p_id_card = '' then
    return null;
  end if;
  v_key := get_encryption_key();
  if v_key is null then
    raise exception 'Encryption key not configured';
  end if;
  return pgp_sym_encrypt(p_id_card, v_key);
end $$;

create or replace function decrypt_id_card(p_encrypted bytea)
returns text
language plpgsql
security definer
as $$
declare v_key text;
begin
  if p_encrypted is null then return null; end if;
  v_key := get_encryption_key();
  if v_key is null then
    raise exception 'Encryption key not configured';
  end if;
  return pgp_sym_decrypt(p_encrypted, v_key);
end $$;

-- helper: set id_card, auto-compute hash + last4 + encrypted
create or replace function set_tenant_id_card(p_tenant_id uuid, p_id_card text)
returns void
language plpgsql
security definer
as $$
begin
  if p_id_card is null or p_id_card = '' then
    update tenants set id_card_encrypted = null, id_card_last4 = null, id_card_hash = null
      where id = p_tenant_id;
    return;
  end if;
  update tenants set
    id_card_encrypted = encrypt_id_card(p_id_card),
    id_card_last4 = right(p_id_card, 4),
    id_card_hash = encode(digest(p_id_card, 'sha256'), 'hex')
  where id = p_tenant_id;
end $$;

-- =====================================================================
-- 6. NOTIFICATION helpers
-- =====================================================================
create or replace function notify_role(
  p_role user_role,
  p_type notification_type,
  p_title text,
  p_body text,
  p_ref_table text,
  p_ref_id uuid,
  p_link_url text default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into notifications(recipient_id, type, title, body, ref_table, ref_id, link_url)
  select id, p_type, p_title, p_body, p_ref_table, p_ref_id, p_link_url
  from profiles where role = p_role;
end $$;

create or replace function notify_user(
  p_user_id uuid,
  p_type notification_type,
  p_title text,
  p_body text,
  p_ref_table text,
  p_ref_id uuid,
  p_link_url text default null
) returns void
language plpgsql
security definer
as $$
begin
  if p_user_id is null then return; end if;
  insert into notifications(recipient_id, type, title, body, ref_table, ref_id, link_url)
  values (p_user_id, p_type, p_title, p_body, p_ref_table, p_ref_id, p_link_url);
end $$;

-- =====================================================================
-- 7. CONTRACT lifecycle triggers (room status sync)
--    NO automatic transitions based on date — only on explicit action.
-- =====================================================================

-- (a) Notify executive on submit; staff on approve/reject
create or replace function on_contract_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  -- New contract submitted for approval (insert as pending_approve)
  if tg_op = 'INSERT' and new.status = 'pending_approve' then
    perform notify_role('executive', 'contract_pending_approve',
      'สัญญารออนุมัติ: ' || new.contract_number,
      'ห้อง ' || (select room_number from rooms where id = new.room_id),
      'contracts', new.id, null);
  end if;

  -- status changed
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- staff submits draft → pending
    if new.status = 'pending_approve' and old.status not in ('pending_approve') then
      perform notify_role('executive', 'contract_pending_approve',
        'สัญญารออนุมัติ: ' || new.contract_number, null,
        'contracts', new.id, null);
    end if;
    -- approved
    if new.status = 'approved' then
      perform notify_user(new.assigned_staff_id, 'contract_approved',
        'สัญญา ' || new.contract_number || ' อนุมัติแล้ว', null,
        'contracts', new.id, null);
    end if;
    -- rejected
    if new.status = 'rejected' then
      perform notify_user(new.assigned_staff_id, 'contract_rejected',
        'สัญญา ' || new.contract_number || ' ถูกปฏิเสธ',
        new.rejection_reason, 'contracts', new.id, null);
    end if;
  end if;

  return new;
end $$;

create trigger trg_contract_status
  after insert or update on contracts
  for each row execute function on_contract_status_change();

-- (b) Sync room status when contract.actual_move_in_at / actual_move_out_at set
create or replace function sync_room_on_move_in_out()
returns trigger
language plpgsql
security definer
as $$
begin
  -- move-in: status approved → active, set room occupied
  if new.actual_move_in_at is not null
     and (old.actual_move_in_at is null or old.actual_move_in_at <> new.actual_move_in_at) then
    update rooms set status = 'occupied' where id = new.room_id;
    if new.status = 'approved' then
      new.status := 'active';
    end if;
  end if;
  return new;
end $$;

create trigger trg_contract_move_in
  before update on contracts
  for each row
  when (new.actual_move_in_at is distinct from old.actual_move_in_at)
  execute function sync_room_on_move_in_out();

-- =====================================================================
-- 8. BOOKING → CONTRACT conversion side-effects
--    When contract is rejected/cancelled and was converted from a booking,
--    revert booking to waiting? Per spec: cancelled booking → room available.
--    But: spec G says if executive rejects, booking becomes available again
--    (treated as never converted). So booking + room both reset.
-- =====================================================================
create or replace function on_contract_finalized()
returns trigger
language plpgsql
security definer
as $$
begin
  -- rejected / cancelled: free up room & booking
  if new.status in ('rejected','cancelled')
     and (old.status not in ('rejected','cancelled')) then
    update rooms set status = 'available' where id = new.room_id and status = 'reserved';
    if new.booking_id is not null then
      update bookings set status = 'waiting', converted_to_contract_id = null,
                          converted_at = null
        where id = new.booking_id;
    end if;
  end if;
  return new;
end $$;

create trigger trg_contract_finalized
  after update on contracts
  for each row execute function on_contract_finalized();

-- =====================================================================
-- 9. MOVE-OUT → room available + contract terminated/expired + create settlement
-- =====================================================================
create or replace function on_move_out_approved()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contract contracts%rowtype;
  v_direction text;
  v_amount numeric(12,2);
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    -- mark contract as terminated or expired
    select * into v_contract from contracts where id = new.contract_id;

    update contracts set
      actual_move_out_at = now(),
      status = case when new.is_early_termination then 'terminated' else 'expired' end,
      terminated_at = case when new.is_early_termination then now() else null end,
      termination_reason = new.reason
    where id = new.contract_id;

    -- free up room
    update rooms set status = 'available' where id = new.room_id;

    -- create settlement record (15-day deadline)
    if new.refund_amount > 0 then
      v_direction := 'refund_to_tenant';
      v_amount := new.refund_amount;
    elsif new.additional_charge > 0 then
      v_direction := 'charge_from_tenant';
      v_amount := new.additional_charge;
    else
      v_direction := 'refund_to_tenant';
      v_amount := 0;
    end if;

    insert into settlements(move_out_id, amount, direction, status)
    values (new.id, v_amount, v_direction, 'pending')
    on conflict (move_out_id) do nothing;

    -- notify staff
    perform notify_user(v_contract.assigned_staff_id, 'move_out_pending',
      'ย้ายออกอนุมัติแล้ว: ' || new.move_out_number,
      'ต้องเคลียร์เงินภายใน ' || to_char(new.settlement_deadline, 'DD/MM/YYYY'),
      'move_outs', new.id, null);
  end if;
  return new;
end $$;

create trigger trg_move_out_approved
  after update on move_outs
  for each row execute function on_move_out_approved();

-- =====================================================================
-- 10. PROFILE auto-create from auth.users (super_admin invites only)
-- =====================================================================
-- Note: profile creation is triggered from app code after auth.users insert,
-- because we want super_admin to specify role + full_name. We provide an RPC.
create or replace function create_profile_for_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role user_role,
  p_phone text default null
) returns void
language plpgsql
security definer
as $$
begin
  if not is_super_admin() then
    raise exception 'Only super_admin can create profiles';
  end if;
  insert into profiles(id, email, full_name, role, phone)
  values (p_user_id, p_email, p_full_name, p_role, p_phone)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone;
end $$;

-- =====================================================================
-- 11. PAYMENT approval → mark invoice paid + handle booking deposit
-- =====================================================================
create or replace function on_payment_approved()
returns trigger
language plpgsql
security definer
as $$
declare
  v_inv invoices%rowtype;
  v_total_paid numeric(12,2);
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    select * into v_inv from invoices where id = new.invoice_id;
    select coalesce(sum(amount),0) into v_total_paid
      from payments where invoice_id = new.invoice_id and status = 'approved';

    if v_total_paid >= v_inv.total_amount then
      update invoices set status = 'paid' where id = new.invoice_id;
    else
      -- partial payment is disallowed per spec; raise error
      raise exception 'Partial payment not allowed. Invoice total: %, paid: %',
        v_inv.total_amount, v_total_paid;
    end if;
  end if;

  -- rejected → invoice → cancelled (per spec F)
  if new.status = 'rejected' and (old.status is null or old.status <> 'rejected') then
    update invoices set status = 'cancelled',
                        cancellation_reason = coalesce(new.rejection_reason, 'Payment rejected')
      where id = new.invoice_id;
  end if;

  return new;
end $$;

create trigger trg_payment_approved
  after update on payments
  for each row execute function on_payment_approved();

-- =====================================================================
-- 12. INVOICE GENERATION — monthly rent + add-ons
-- =====================================================================
-- Generate next month's invoice for one contract.
-- For first month: prorated handled by separate function on move-in.
create or replace function generate_monthly_invoice(
  p_contract_id uuid,
  p_period text   -- 'YYYY-MM' (the month being billed)
) returns uuid
language plpgsql
security definer
as $$
declare
  v_contract contracts%rowtype;
  v_invoice_id uuid;
  v_period_start date;
  v_period_end date;
  v_due_date date;
  v_addon record;
begin
  select * into v_contract from contracts where id = p_contract_id;
  if v_contract.id is null then
    raise exception 'Contract not found';
  end if;
  if v_contract.status not in ('active') then
    -- only generate for active contracts
    return null;
  end if;

  v_period_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;

  -- skip if period falls outside contract range
  if v_period_start > v_contract.contract_end_date then return null; end if;
  if v_period_end < v_contract.contract_start_date then return null; end if;

  -- due date = payment_day of this period
  v_due_date := (v_period_start + (v_contract.payment_day - 1) * interval '1 day')::date;

  -- check for duplicate
  if exists (
    select 1 from invoices
    where contract_id = p_contract_id
      and billing_period = p_period
      and invoice_type = 'monthly_rent'
      and status not in ('cancelled', 'rejected')
  ) then
    return null;
  end if;

  insert into invoices(invoice_type, contract_id, tenant_id, room_id,
                       billing_period, issue_date, due_date, status, note)
  values ('monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          p_period, current_date, v_due_date, 'pending',
          'ค่าเช่ารายเดือน ' || p_period)
  returning id into v_invoice_id;

  -- main rent line
  insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  values (v_invoice_id, 'ค่าเช่าห้อง ' ||
          (select room_number from rooms where id = v_contract.room_id) ||
          ' เดือน ' || p_period,
          'rent', 1, v_contract.monthly_rent, v_contract.monthly_rent, 1);

  -- add-ons (monthly cycle, active, within date range)
  for v_addon in
    select * from contract_addons
    where contract_id = p_contract_id
      and is_active = true
      and billing_cycle = 'monthly'
      and (start_date is null or start_date <= v_period_end)
      and (end_date is null or end_date >= v_period_start)
  loop
    insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    values (v_invoice_id, v_addon.name, 'addon', 1, v_addon.amount, v_addon.amount, 10);
  end loop;

  return v_invoice_id;
end $$;

-- =====================================================================
-- 13. PRORATED FIRST-MONTH INVOICE — generated when staff presses "move-in"
-- =====================================================================
create or replace function generate_prorated_first_invoice(
  p_contract_id uuid
) returns uuid
language plpgsql
security definer
as $$
declare
  v_contract contracts%rowtype;
  v_invoice_id uuid;
  v_move_in date;
  v_month_end date;
  v_days_in_month int;
  v_days_charged int;
  v_prorated numeric(12,2);
  v_period text;
  v_due_date date;
  v_addon record;
  v_addon_prorated numeric(12,2);
begin
  select * into v_contract from contracts where id = p_contract_id;
  v_move_in := v_contract.actual_move_in_at::date;
  if v_move_in is null then
    raise exception 'Contract has no actual move-in date';
  end if;

  -- only prorate if move-in is NOT on the 1st
  if extract(day from v_move_in) = 1 then
    return null;
  end if;

  v_month_end := (date_trunc('month', v_move_in) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_month_end)::int;
  v_days_charged := v_days_in_month - extract(day from v_move_in)::int + 1;
  v_prorated := round(v_contract.monthly_rent * v_days_charged / v_days_in_month, 2);
  v_period := to_char(v_move_in, 'YYYY-MM');
  v_due_date := v_move_in;

  -- guard duplicate
  if exists(
    select 1 from invoices
    where contract_id = p_contract_id and billing_period = v_period
      and invoice_type = 'monthly_rent' and status not in ('cancelled','rejected')
  ) then
    return null;
  end if;

  insert into invoices(invoice_type, contract_id, tenant_id, room_id,
                       billing_period, issue_date, due_date, status, note)
  values ('monthly_rent', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          v_period, current_date, v_due_date, 'pending',
          format('ค่าเช่า prorated %s–%s', to_char(v_move_in,'DD/MM'), to_char(v_month_end,'DD/MM')))
  returning id into v_invoice_id;

  insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  values (v_invoice_id,
          format('ค่าเช่า prorated %s วัน (%s–%s)', v_days_charged,
                 to_char(v_move_in,'DD/MM/YYYY'), to_char(v_month_end,'DD/MM/YYYY')),
          'rent', v_days_charged, round(v_contract.monthly_rent / v_days_in_month, 2),
          v_prorated, 1);

  -- prorated add-ons
  for v_addon in
    select * from contract_addons
    where contract_id = p_contract_id and is_active = true and billing_cycle = 'monthly'
  loop
    v_addon_prorated := round(v_addon.amount * v_days_charged / v_days_in_month, 2);
    insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    values (v_invoice_id, v_addon.name || ' (prorated)', 'addon', v_days_charged,
            round(v_addon.amount / v_days_in_month, 2), v_addon_prorated, 10);
  end loop;

  return v_invoice_id;
end $$;

-- =====================================================================
-- 14. CONTRACT INITIAL INVOICE — deposit + advance (created on contract approval)
-- =====================================================================
create or replace function generate_contract_initial_invoice(
  p_contract_id uuid
) returns uuid
language plpgsql
security definer
as $$
declare
  v_contract contracts%rowtype;
  v_invoice_id uuid;
  v_room_number text;
begin
  select * into v_contract from contracts where id = p_contract_id;
  select room_number into v_room_number from rooms where id = v_contract.room_id;

  -- guard
  if exists(select 1 from invoices where contract_id = p_contract_id
            and invoice_type = 'contract_initial' and status not in ('cancelled','rejected')) then
    return null;
  end if;

  insert into invoices(invoice_type, contract_id, tenant_id, room_id,
                       issue_date, due_date, status, note)
  values ('contract_initial', p_contract_id, v_contract.tenant_id, v_contract.room_id,
          current_date, current_date, 'pending',
          'เงินประกัน + ค่าเช่าล่วงหน้า สัญญา ' || v_contract.contract_number)
  returning id into v_invoice_id;

  insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
  values
    (v_invoice_id, 'เงินประกัน ห้อง ' || v_room_number, 'deposit', 1,
     v_contract.deposit_amount, v_contract.deposit_amount, 1),
    (v_invoice_id, 'ค่าเช่าล่วงหน้า', 'advance', 1,
     v_contract.advance_rent_amount, v_contract.advance_rent_amount, 2);

  -- subtract booking deposit if any
  if v_contract.booking_deposit_applied > 0 then
    insert into invoice_items(invoice_id, description, item_type, quantity, unit_price, amount, display_order)
    values (v_invoice_id, 'หักเงินจอง', 'discount', 1,
            -v_contract.booking_deposit_applied, -v_contract.booking_deposit_applied, 3);
  end if;

  return v_invoice_id;
end $$;

-- =====================================================================
-- 15. MARK INVOICES OVERDUE — run daily
-- =====================================================================
create or replace function mark_overdue_invoices()
returns int
language plpgsql
security definer
as $$
declare v_count int;
begin
  update invoices
    set status = 'overdue'
    where status = 'pending' and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- =====================================================================
-- 16. CRON: monthly invoice generation (25th of each month)
-- =====================================================================
-- This generates invoices for the NEXT calendar month for all active contracts.
create or replace function generate_invoices_for_next_month()
returns int
language plpgsql
security definer
as $$
declare
  v_period text;
  v_contract record;
  v_count int := 0;
  v_inv uuid;
begin
  v_period := to_char((current_date + interval '1 month'), 'YYYY-MM');
  for v_contract in
    select id from contracts where status = 'active'
  loop
    v_inv := generate_monthly_invoice(v_contract.id, v_period);
    if v_inv is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- =====================================================================
-- 17. NOTIFY contract-expiring & settlement-overdue
-- =====================================================================
create or replace function notify_contracts_expiring()
returns int
language plpgsql
security definer
as $$
declare
  v_days int := 30;
  v_contract record;
  v_count int := 0;
begin
  -- read days threshold from settings if present
  select coalesce((value->>'contract_expiring_days')::int, 30) into v_days
    from settings where key = 'notification';

  for v_contract in
    select c.id, c.contract_number, c.assigned_staff_id, c.contract_end_date,
           r.room_number
    from contracts c join rooms r on r.id = c.room_id
    where c.status = 'active'
      and c.contract_end_date - current_date = v_days
  loop
    -- staff
    perform notify_user(v_contract.assigned_staff_id, 'contract_expiring',
      format('สัญญาใกล้หมด: ห้อง %s', v_contract.room_number),
      format('สัญญา %s หมดวันที่ %s', v_contract.contract_number,
             to_char(v_contract.contract_end_date,'DD/MM/YYYY')),
      'contracts', v_contract.id, null);
    -- head_staff
    perform notify_role('head_staff', 'contract_expiring',
      format('สัญญาใกล้หมด: ห้อง %s', v_contract.room_number),
      v_contract.contract_number, 'contracts', v_contract.id, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function notify_settlement_overdue()
returns int
language plpgsql
security definer
as $$
declare v_mo record; v_count int := 0;
begin
  for v_mo in
    select mo.id, mo.move_out_number, mo.settlement_deadline
    from move_outs mo
    join settlements s on s.move_out_id = mo.id
    where mo.status = 'approved'
      and s.status = 'pending'
      and mo.settlement_deadline = current_date
  loop
    perform notify_role('accounting', 'settlement_overdue',
      'เคลียร์เงินคืนครบ 15 วัน: ' || v_mo.move_out_number,
      'ต้องดำเนินการคืนเงินภายในวันนี้', 'move_outs', v_mo.id, null);
    perform notify_role('head_staff', 'settlement_overdue',
      'เคลียร์เงินคืนครบ 15 วัน: ' || v_mo.move_out_number,
      null, 'move_outs', v_mo.id, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function notify_payment_overdue()
returns int
language plpgsql
security definer
as $$
declare v_inv record; v_grace int := 3; v_count int := 0;
begin
  select coalesce((value->>'overdue_alert_days')::int, 3) into v_grace
    from settings where key = 'notification';

  for v_inv in
    select i.id, i.invoice_number, i.due_date, c.assigned_staff_id, r.room_number
    from invoices i
    join contracts c on c.id = i.contract_id
    join rooms r on r.id = i.room_id
    where i.status = 'overdue'
      and current_date - i.due_date = v_grace
  loop
    perform notify_user(v_inv.assigned_staff_id, 'payment_overdue',
      format('เกินกำหนดชำระ: ห้อง %s', v_inv.room_number),
      format('ใบแจ้งหนี้ %s ครบกำหนด %s', v_inv.invoice_number,
             to_char(v_inv.due_date,'DD/MM/YYYY')),
      'invoices', v_inv.id, null);
    perform notify_role('head_staff', 'payment_overdue',
      format('เกินกำหนดชำระ: ห้อง %s', v_inv.room_number),
      v_inv.invoice_number, 'invoices', v_inv.id, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- =====================================================================
-- 18. SETTLEMENT DEADLINE auto-fill on move-out creation
-- =====================================================================
create or replace function set_settlement_deadline()
returns trigger language plpgsql as $$
begin
  if new.settlement_deadline is null then
    new.settlement_deadline := new.move_out_date + 15;
  end if;
  return new;
end $$;
create trigger trg_settlement_deadline before insert on move_outs
  for each row execute function set_settlement_deadline();

-- =====================================================================
-- 19. BOOKING → reserved room
-- =====================================================================
create or replace function on_booking_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' and new.status = 'waiting' then
    update rooms set status = 'reserved'
      where id = new.room_id and status = 'available';
  end if;
  if tg_op = 'UPDATE' then
    -- cancelled → room available (only if still reserved by this booking)
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      update rooms set status = 'available'
        where id = new.room_id and status = 'reserved'
          and not exists (
            select 1 from contracts c
            where c.room_id = new.room_id
              and c.status in ('pending_approve','approved','active')
          );
    end if;
  end if;
  return new;
end $$;
create trigger trg_booking_change
  after insert or update on bookings
  for each row execute function on_booking_change();
