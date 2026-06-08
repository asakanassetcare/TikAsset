create or replace function set_tenant_id_card(p_tenant_id uuid, p_id_card text)
returns void language plpgsql security definer
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