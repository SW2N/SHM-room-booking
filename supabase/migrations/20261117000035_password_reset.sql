-- Password reset by an admin (the built-in email can't reach staff): the admin gets a temporary password to pass
-- on, and the person is asked to choose their own at next sign-in.
alter table public.profiles add column must_change_password boolean not null default false;

create or replace function public.admin_reset_password(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';  -- no look-alikes (0/O, 1/l/I)
  b bytea := extensions.gen_random_bytes(10);
  tmp text := '';
begin
  if not is_admin() then perform raise_err('NOT_ADMIN'); end if;
  select * into p from profiles where email = lower(trim(p_email));
  if p.id is null then perform raise_err('NOT_FOUND'); end if;
  for i in 0..9 loop
    tmp := tmp || substr(chars, 1 + get_byte(b, i) % length(chars), 1);
  end loop;
  update auth.users set encrypted_password = extensions.crypt(tmp, extensions.gen_salt('bf')), updated_at = now() where id = p.id;
  update profiles set must_change_password = true where id = p.id;
  return tmp;
end $$;
revoke all on function public.admin_reset_password(text) from public, anon;
grant execute on function public.admin_reset_password(text) to authenticated;

-- Called by the app after the person sets their own password.
create or replace function public.password_changed()
returns void language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;
