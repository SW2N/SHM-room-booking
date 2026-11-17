-- Sign-up is open to any company email again (the user, 17 Nov: the list gate blocked new staff).
-- The staff list fills in details for people already on it, blocks disabled people, and gains everyone
-- who signs up without being listed, using the name and department they gave.
create or replace function public.can_sign_up(p_email text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when lower(trim(p_email)) not like '%@sahamitproduct.com' then 'NOT_SHM_EMAIL'
    when exists (select 1 from staff where email = lower(trim(p_email)) and not active) then 'ACCOUNT_DISABLED'
    when exists (select 1 from staff where email = lower(trim(p_email))) then 'listed'
    else 'new' end;
$$;

create or replace function public.enforce_shm_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@sahamitproduct.com' then
    perform raise_err('NOT_SHM_EMAIL');
  end if;
  if tg_op = 'INSERT' and can_sign_up(new.email) = 'ACCOUNT_DISABLED' then
    perform raise_err('ACCOUNT_DISABLED');
  end if;
  return new;
end $$;

create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s staff;
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1));
  v_dept text := upper(trim(coalesce(new.raw_user_meta_data ->> 'department', '')));
begin
  if v_dept not in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS') then v_dept := 'OTHERS'; end if;
  select * into s from staff where email = lower(new.email);
  if s.email is null then
    -- Not listed yet: they join the list with what they gave, as staff.
    insert into staff (email, display_name, department, role, active) values (lower(new.email), v_name, v_dept, 'user', true)
    returning * into s;
  end if;
  insert into profiles (id, email, display_name, department, role)
  values (new.id, lower(new.email), s.display_name, s.department, s.role);
  return new;
end $$;
