-- User management: a staff list (who may sign up, with name / department / role), disabling accounts,
-- and admin functions to read and save the list. Spec: docs/superpowers/specs/2026-11-17-user-management-design.md

-- 1. The staff list.
create table public.staff (
  email text primary key check (email = lower(trim(email))),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  department text not null check (department in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS')),
  role text not null default 'user' check (role in ('user', 'admin')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.staff enable row level security;
create policy staff_admin_read on public.staff for select to authenticated using (public.is_admin());
revoke all on public.staff from anon;
grant select on public.staff to authenticated;

-- 2. Accounts can be disabled; departments follow the fixed list.
alter table public.profiles add column active boolean not null default true;
update public.profiles set department = 'BD' where email = 'sunpawat.w@sahamitproduct.com' and department is null;
update public.profiles set department = 'OTHERS' where department is not null and department not in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS');
alter table public.profiles add constraint profiles_department_check check (department is null or department in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS'));

-- Everyone who already has an account goes on the list.
insert into public.staff (email, display_name, department, role, active)
select lower(email), display_name, coalesce(department, 'OTHERS'), role, active from public.profiles where not is_demo
on conflict (email) do nothing;

-- 3. Admin powers need an active account.
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'admin' and active);
$$;

-- 4. Sign-up: company email, on the staff list, and not disabled.
create or replace function public.can_sign_up(p_email text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when lower(trim(p_email)) not like '%@sahamitproduct.com' then 'NOT_SHM_EMAIL'
    when not exists (select 1 from staff) then 'ok'
    when not exists (select 1 from staff where email = lower(trim(p_email))) then 'NOT_ON_STAFF_LIST'
    when exists (select 1 from staff where email = lower(trim(p_email)) and not active) then 'ACCOUNT_DISABLED'
    else 'ok' end;
$$;
revoke all on function public.can_sign_up(text) from public;
grant execute on function public.can_sign_up(text) to anon, authenticated;

create or replace function public.enforce_shm_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if new.email is null or lower(new.email) not like '%@sahamitproduct.com' then
    perform raise_err('NOT_SHM_EMAIL');
  end if;
  if tg_op = 'INSERT' then
    v := can_sign_up(new.email);
    if v <> 'ok' then perform raise_err(v); end if;
  end if;
  return new;
end $$;

-- A new account takes its name, department and role from the staff list.
create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare s staff;
begin
  select * into s from staff where email = lower(new.email);
  insert into profiles (id, email, display_name, department, role)
  values (new.id, lower(new.email),
          coalesce(s.display_name, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
          coalesce(s.department, case when new.raw_user_meta_data ->> 'department' in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS') then new.raw_user_meta_data ->> 'department' end),
          coalesce(s.role, 'user'));
  return new;
end $$;

-- 5. A disabled account can't book, hold a slot or receive a handover.
create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s timestamp := new.starts_at at time zone 'Asia/Bangkok';
  e timestamp := new.ends_at at time zone 'Asia/Bangkok';
  privileged boolean;
  same_slot boolean := tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.room_code = old.room_code;
begin
  if session_user = 'postgres' and current_setting('app.bypass_rules', true) = 'on' then
    return new;
  end if;

  if new.ends_at <= new.starts_at then perform raise_err('INVALID_RANGE'); end if;
  if extract(minute from s)::int not in (0, 30) or extract(second from s) <> 0
     or extract(minute from e)::int not in (0, 30) or extract(second from e) <> 0 then
    perform raise_err('NOT_ALIGNED');
  end if;
  if s::date <> (e - interval '1 microsecond')::date
     or s::time < time '08:00' or e > s::date + time '20:00' then
    perform raise_err('OUTSIDE_HOURS');
  end if;

  if exists (select 1 from holds h
             where h.room_code = new.room_code and h.expires_at > now()
               and h.user_id is distinct from coalesce(auth.uid(), new.owner_id)
               and tstzrange(h.starts_at, h.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')) then
    perform raise_err('ROOM_HELD');
  end if;
  if same_slot then return new; end if;

  -- A disabled account can't book (admins can't book for one either).
  if exists (select 1 from profiles where id = new.owner_id and not active) then perform raise_err('ACCOUNT_DISABLED'); end if;

  privileged := is_admin(new.owner_id) or is_admin(auth.uid());
  if not privileged then
    if extract(isodow from s) in (6, 7) then perform raise_err('WEEKEND'); end if;
    if exists (select 1 from holidays where day = s::date) then perform raise_err('HOLIDAY'); end if;
    if exists (select 1 from profiles where id = new.owner_id and banned_until > now()) then
      perform raise_err('BANNED');
    end if;
    if s::date > ((now() at time zone 'Asia/Bangkok')::date + interval '3 months')::date then
      perform raise_err('TOO_FAR_AHEAD');
    end if;
  end if;

  if new.starts_at < now() then perform raise_err('IN_PAST'); end if;
  return new;
end $$;

create or replace function public.place_hold(p_room text, p_starts timestamptz, p_ends timestamptz, p_booking_id uuid default null)
returns public.holds language plpgsql security definer set search_path = public as $$
declare
  v holds;
  s timestamp := p_starts at time zone 'Asia/Bangkok';
  e timestamp := p_ends at time zone 'Asia/Bangkok';
begin
  if auth.uid() is null then perform raise_err('NOT_FOUND'); end if;
  if exists (select 1 from profiles where id = auth.uid() and not active) then perform raise_err('ACCOUNT_DISABLED'); end if;
  if p_ends <= p_starts then perform raise_err('INVALID_RANGE'); end if;
  if extract(minute from s)::int not in (0, 30) or extract(second from s) <> 0
     or extract(minute from e)::int not in (0, 30) or extract(second from e) <> 0 then
    perform raise_err('NOT_ALIGNED');
  end if;
  if s::date <> (e - interval '1 microsecond')::date or s::time < time '08:00' or e > s::date + time '20:00' then
    perform raise_err('OUTSIDE_HOURS');
  end if;
  if not is_admin() then
    if extract(isodow from s) in (6, 7) then perform raise_err('WEEKEND'); end if;
    if exists (select 1 from holidays where day = s::date) then perform raise_err('HOLIDAY'); end if;
    if exists (select 1 from profiles where id = auth.uid() and banned_until > now()) then perform raise_err('BANNED'); end if;
    if s::date > ((now() at time zone 'Asia/Bangkok')::date + interval '3 months')::date then perform raise_err('TOO_FAR_AHEAD'); end if;
  end if;
  if p_starts < now() then perform raise_err('IN_PAST'); end if;

  perform pg_advisory_xact_lock(hashtext('hold:' || p_room));
  -- Each open form (tab, device) keeps its own hold, with no limit: team admins book for many people at once.
  delete from holds where expires_at <= now() and (user_id = auth.uid() or room_code = p_room);
  if exists (select 1 from holds h where h.room_code = p_room and h.expires_at > now() and h.user_id <> auth.uid()
             and tstzrange(h.starts_at, h.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')) then
    perform raise_err('ROOM_HELD');
  end if;
  if exists (select 1 from bookings b where b.room_code = p_room and b.status in ('confirmed', 'checked_in')
             and not coalesce(b.id = p_booking_id and (b.owner_id = auth.uid() or is_admin()), false)   -- only your own booking can be re-held
             and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')) then
    perform raise_err('ROOM_TAKEN');
  end if;
  insert into holds (room_code, starts_at, ends_at, user_id, booking_id, expires_at)
  values (p_room, p_starts, p_ends, auth.uid(), p_booking_id, now() + interval '5 minutes')
  returning * into v;
  return v;
exception when foreign_key_violation then perform raise_err('NOT_FOUND');
end $$;

create or replace function public.hand_over(p_booking_id uuid, p_whole_series boolean, p_to_email text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v bookings;
  s booking_series;
  rcpt profiles;
  ids uuid[];
begin
  select * into v from bookings where id = p_booking_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status <> 'confirmed' or v.starts_at <= now() then perform raise_err('NOT_ACTIVE'); end if;

  select * into rcpt from profiles where email = lower(trim(p_to_email));
  if rcpt.id is null or rcpt.is_demo or not rcpt.active then perform raise_err('RECIPIENT_NOT_FOUND'); end if;
  if rcpt.banned_until > now() then perform raise_err('RECIPIENT_BANNED'); end if;

  if p_whole_series and v.series_id is not null then
    select * into s from booking_series where id = v.series_id for update;
    if s.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
    with moved as (
      update bookings set owner_id = rcpt.id, handover_unseen = true
      where series_id = s.id and owner_id = s.owner_id and status = 'confirmed' and starts_at > now()
      returning id
    ) select array_agg(id) into ids from moved;
    update booking_series set owner_id = rcpt.id where id = s.id;
  else
    update bookings set owner_id = rcpt.id, handover_unseen = true where id = v.id;
    ids := array[v.id];
  end if;

  insert into handovers (from_user, to_user, booking_ids, series_id, done_by)
  values (v.owner_id, rcpt.id, coalesce(ids, '{}'), case when p_whole_series then v.series_id end, auth.uid());
  return coalesce(array_length(ids, 1), 0);
end $$;

-- 6. Admin: read the list with each person's account details.
create or replace function public.admin_staff_list()
returns table (email text, display_name text, department text, role text, active boolean, has_account boolean,
               user_id uuid, last_sign_in timestamptz, upcoming integer, paused_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then perform raise_err('NOT_ADMIN'); end if;
  return query
  select coalesce(s.email, p.email), coalesce(s.display_name, p.display_name), coalesce(s.department, p.department, 'OTHERS'),
         coalesce(s.role, p.role), coalesce(s.active, p.active), p.id is not null, p.id, u.last_sign_in_at,
         (select count(*)::int from bookings b where b.owner_id = p.id and b.status in ('confirmed', 'checked_in') and b.ends_at > now()),
         case when p.banned_until > now() then p.banned_until end
  from staff s
  full join profiles p on p.email = s.email and not p.is_demo
  left join auth.users u on u.id = p.id
  where s.email is not null or not p.is_demo
  order by 2;
end $$;
revoke all on function public.admin_staff_list() from public, anon;
grant execute on function public.admin_staff_list() to authenticated;

-- 7. Admin: save rows of the list (an upload never deletes anyone). Changes reach the matching account;
-- disabling cancels their upcoming bookings (hand any over first) and blocks sign-in; enabling lifts that.
create or replace function public.admin_save_staff(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_email text; v_name text; v_dept text; v_role text; v_active boolean;
  me text := (select email from profiles where id = auth.uid());
  p profiles;
  n integer := 0;
begin
  if not is_admin() then perform raise_err('NOT_ADMIN'); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(r ->> 'email'));
    v_name := trim(coalesce(r ->> 'display_name', ''));
    v_dept := upper(trim(coalesce(r ->> 'department', '')));
    v_role := lower(trim(coalesce(r ->> 'role', 'user')));
    v_active := coalesce((r ->> 'active')::boolean, true);
    if v_email is null or v_email not like '%@sahamitproduct.com' then perform raise_err('NOT_SHM_EMAIL'); end if;
    if v_name = '' then perform raise_err('NAME_REQUIRED'); end if;
    if v_dept not in ('TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS') then perform raise_err('BAD_DEPARTMENT'); end if;
    if v_role not in ('user', 'admin') then perform raise_err('BAD_ROLE'); end if;
    if v_email = me and (v_role <> 'admin' or not v_active) then perform raise_err('CANNOT_CHANGE_SELF'); end if;

    insert into staff (email, display_name, department, role, active, updated_at)
    values (v_email, v_name, v_dept, v_role, v_active, now())
    on conflict (email) do update set display_name = excluded.display_name, department = excluded.department,
      role = excluded.role, active = excluded.active, updated_at = now();

    select * into p from profiles where email = v_email;
    if p.id is not null then
      update profiles set display_name = v_name, department = v_dept, role = v_role, active = v_active where id = p.id;
      if p.active and not v_active then
        update bookings set status = 'cancelled', cancelled_reason = 'account_disabled'
        where owner_id = p.id and status = 'confirmed' and starts_at > now();
        delete from holds where user_id = p.id;
        update auth.users set banned_until = '2999-12-31 00:00+00' where id = p.id;
      elsif not p.active and v_active then
        update auth.users set banned_until = null where id = p.id;
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.admin_save_staff(jsonb) from public, anon;
grant execute on function public.admin_save_staff(jsonb) to authenticated;

-- 8. Test helper: test accounts go on the staff list first, as real ones must.
create or replace function tests.make_user(p_email text, p_name text default 'Test', p_admin boolean default false)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid := gen_random_uuid();
begin
  if lower(p_email) like '%@sahamitproduct.com' then
    insert into public.staff (email, display_name, department, role)
    values (lower(p_email), p_name, 'OTHERS', case when p_admin then 'admin' else 'user' end)
    on conflict (email) do nothing;
  end if;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('display_name', p_name, 'department', 'OTHERS'), now(), now());
  if p_admin then update public.profiles set role = 'admin' where id = v_id; end if;
  return v_id;
end $$;
