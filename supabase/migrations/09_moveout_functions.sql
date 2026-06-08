-- =============================================================================
-- Move-out approval: atomic approval, contract termination, room release,
-- and settlement creation in a single transaction.
-- =============================================================================

create or replace function approve_move_out(p_move_out_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_mo            move_outs%rowtype;
  v_approver_id   uuid;
  v_direction     text;
  v_amount        numeric(12,2);
begin
  -- Role check: only accounting or super_admin
  select id into v_approver_id
  from profiles
  where id = auth.uid()
    and role in ('accounting', 'super_admin');
  if not found then
    raise exception 'Permission denied';
  end if;

  select * into v_mo from move_outs where id = p_move_out_id for update;
  if not found then
    raise exception 'Move-out record not found';
  end if;
  if v_mo.status <> 'pending_accounting' then
    raise exception 'Move-out is already % — cannot approve again', v_mo.status;
  end if;

  -- 1. Approve the move-out
  update move_outs set
    status      = 'approved',
    approved_by = v_approver_id,
    approved_at = now()
  where id = p_move_out_id;

  -- 2. Terminate the contract
  update contracts set
    status          = 'terminated',
    terminated_at   = now(),
    actual_move_out_at = v_mo.move_out_date::timestamptz,
    electric_meter_end = v_mo.electric_meter_end,
    water_meter_end    = v_mo.water_meter_end
  where id = v_mo.contract_id;

  -- 3. Free the room
  update rooms set status = 'available'
  where id = v_mo.room_id;

  -- 4. Create settlement only when there is a monetary result
  if v_mo.refund_amount > 0 then
    v_direction := 'refund_to_tenant';
    v_amount    := v_mo.refund_amount;
  elsif v_mo.additional_charge > 0 then
    v_direction := 'charge_from_tenant';
    v_amount    := v_mo.additional_charge;
  else
    -- Zero net — skip settlement, go straight to settled
    update move_outs set status = 'settled' where id = p_move_out_id;
    return;
  end if;

  insert into settlements (move_out_id, amount, direction)
  values (p_move_out_id, v_amount, v_direction);
end;
$$;

revoke all on function approve_move_out(uuid) from public, anon, authenticated;
grant  execute on function approve_move_out(uuid) to authenticated;

-- =============================================================================
-- confirm_settlement: staff marks slip uploaded (paid_by_staff)
-- =============================================================================
create or replace function confirm_settlement_paid(
  p_settlement_id uuid,
  p_slip_url      text,
  p_bank_ref      text default null,
  p_note          text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_staff_id uuid;
  v_mo_id    uuid;
begin
  select id into v_staff_id
  from profiles
  where id = auth.uid()
    and role in ('super_admin', 'head_staff', 'staff');
  if not found then raise exception 'Permission denied'; end if;

  select move_out_id into v_mo_id from settlements where id = p_settlement_id and status = 'pending';
  if not found then raise exception 'Settlement not found or already processed'; end if;

  update settlements set
    status       = 'paid_by_staff',
    slip_url     = p_slip_url,
    bank_reference = p_bank_ref,
    note         = p_note,
    paid_by_staff = v_staff_id,
    paid_at      = now()
  where id = p_settlement_id;
end;
$$;

revoke all on function confirm_settlement_paid(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function confirm_settlement_paid(uuid, text, text, text) to authenticated;

-- =============================================================================
-- confirm_settlement_completed: accounting confirms settlement → settled
-- =============================================================================
create or replace function confirm_settlement_completed(p_settlement_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_acct_id  uuid;
  v_mo_id    uuid;
begin
  select id into v_acct_id
  from profiles
  where id = auth.uid()
    and role in ('accounting', 'super_admin');
  if not found then raise exception 'Permission denied'; end if;

  select move_out_id into v_mo_id
  from settlements where id = p_settlement_id and status = 'paid_by_staff';
  if not found then raise exception 'Settlement not found or not in paid_by_staff state'; end if;

  update settlements set
    status       = 'completed',
    confirmed_by = v_acct_id,
    confirmed_at = now()
  where id = p_settlement_id;

  update move_outs set status = 'settled' where id = v_mo_id;
end;
$$;

revoke all on function confirm_settlement_completed(uuid) from public, anon, authenticated;
grant  execute on function confirm_settlement_completed(uuid) to authenticated;
