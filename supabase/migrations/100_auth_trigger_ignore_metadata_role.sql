-- =====================================================================
-- Migration 100: handle_new_auth_user ไม่อ่าน role จาก raw_user_meta_data
-- raw_user_meta_data มาจากผู้สมัครเองได้ (auth.signUp({ options: { data } }))
-- ถ้าเปิด sign up อยู่ ใครก็สมัครแนบ role = 'super_admin' ได้
-- profile ใหม่จึงเป็น 'staff' เสมอ; role จริงตั้งผ่าน create_profile_for_user
-- (invite-user edge function) ซึ่งไม่ได้พึ่ง metadata อยู่แล้ว
-- =====================================================================

create or replace function public.handle_new_auth_user()
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
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end $$;
