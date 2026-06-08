-- =====================================================================
-- Migration 11: Fix pgcrypto search_path for encrypt/decrypt functions
--   pgcrypto is installed in the extensions schema, not public.
--   SECURITY DEFINER functions with set search_path = public cannot
--   see pgp_sym_encrypt / pgp_sym_decrypt.
-- =====================================================================

create or replace function encrypt_id_card(p_id_card text)
returns bytea
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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
