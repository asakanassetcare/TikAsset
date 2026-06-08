-- Allow head_staff to manage operational user accounts without granting
-- accounting/executive/super_admin permissions.

create or replace function create_profile_for_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role user_role,
  p_phone text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role user_role;
begin
  v_caller_role := current_user_role();

  if v_caller_role = 'super_admin' then
    if p_role = 'super_admin' then
      raise exception 'Cannot create super_admin from this form';
    end if;
  elsif v_caller_role = 'head_staff' then
    if p_role not in ('head_staff', 'staff', 'service') then
      raise exception 'head_staff can only create operational users';
    end if;
  else
    raise exception 'permission denied';
  end if;

  insert into profiles(id, email, full_name, role, phone)
  values (p_user_id, p_email, p_full_name, p_role, p_phone)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone;
end $$;

revoke all on function create_profile_for_user(uuid, text, text, user_role, text) from public, anon, authenticated;
grant execute on function create_profile_for_user(uuid, text, text, user_role, text) to authenticated;

create or replace function update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text default null,
  p_role user_role default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role user_role;
  v_target_role user_role;
  v_next_role user_role;
begin
  v_caller_role := current_user_role();

  select role into v_target_role
  from profiles
  where id = p_user_id;

  if v_target_role is null then
    raise exception 'profile not found';
  end if;

  v_next_role := coalesce(p_role, v_target_role);

  if v_caller_role = 'super_admin' then
    if v_target_role = 'super_admin' or v_next_role = 'super_admin' then
      raise exception 'Cannot edit super_admin from this form';
    end if;
  elsif v_caller_role = 'head_staff' then
    if v_target_role not in ('head_staff', 'staff', 'service')
       or v_next_role not in ('head_staff', 'staff', 'service') then
      raise exception 'head_staff can only manage operational users';
    end if;
  else
    raise exception 'permission denied';
  end if;

  update profiles
  set full_name = p_full_name,
      phone = nullif(p_phone, ''),
      role = v_next_role
  where id = p_user_id;
end $$;

revoke all on function update_user_profile(uuid, text, text, user_role) from public, anon, authenticated;
grant execute on function update_user_profile(uuid, text, text, user_role) to authenticated;
