-- Allow head_staff to maintain normal app settings, while keeping secret
-- settings such as the ID-card encryption key protected.

drop policy if exists "settings_super_admin_write" on settings;
drop policy if exists "settings_admin_write" on settings;

create policy "settings_admin_write" on settings
  for all
  using (
    auth.uid() is not null
    and key <> '_encryption'
    and current_user_role() in ('super_admin', 'head_staff')
  )
  with check (
    auth.uid() is not null
    and key <> '_encryption'
    and current_user_role() in ('super_admin', 'head_staff')
  );
