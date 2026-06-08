-- =====================================================================
-- Migration 06: Auto-create profile when auth.users is inserted
-- Fixes the chicken-and-egg problem where create_profile_for_user
-- requires the caller to already have a profile.
-- =====================================================================

-- Trigger function: insert profile with defaults on new auth user
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      (new.raw_user_meta_data->>'role')::user_role,
      'staff'
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- =====================================================================
-- Backfill: insert profiles for existing auth users that have no profile
-- (e.g. super_admin created manually in Supabase Dashboard)
-- =====================================================================
insert into public.profiles(id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'staff'::user_role
from auth.users u
where u.id not in (select id from public.profiles)
on conflict (id) do nothing;
