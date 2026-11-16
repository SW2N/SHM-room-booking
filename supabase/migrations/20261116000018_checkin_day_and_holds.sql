-- Phase 2 back end:
--  * check-in is open from 00:00 (Bangkok) on the booking day until 15 minutes after the start
--  * holds: while someone has the booking form open, the room and time are held for them (5 minutes, renewable);
--    others get ROOM_HELD. The holder's own hold is removed when their booking is saved.
--  * live updates (Supabase Realtime) on bookings and holds

create or replace function public._check_in_at(p_id uuid, p_now timestamptz)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  select * into v from bookings where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status <> 'confirmed' then perform raise_err('NOT_ACTIVE'); end if;
  if p_now < ((v.starts_at at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok' or p_now > v.starts_at + interval '15 minutes' then
    perform raise_err('CHECKIN_WINDOW');
  end if;
  update bookings set status = 'checked_in', checked_in_at = p_now where id = p_id returning * into v;
  update profiles set no_show_streak = 0 where id = v.owner_id;
  return v;
end $$;


create table public.holds (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  user_id uuid not null references public.profiles on delete cascade,
  booking_id uuid references public.bookings on delete cascade,
  expires_at timestamptz not null,
  check (ends_at > starts_at)
);
create index holds_room_idx on public.holds (room_code, starts_at);
alter table public.holds enable row level security;
create policy holds_read on public.holds for select to authenticated using (true);

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
  if same_slot then return new; end if;

  if exists (select 1 from holds h
             where h.room_code = new.room_code and h.expires_at > now()
               and h.user_id is distinct from coalesce(auth.uid(), new.owner_id)
               and tstzrange(h.starts_at, h.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')) then
    perform raise_err('ROOM_HELD');
  end if;

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


create or replace function public._clear_own_hold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from holds
  where user_id = coalesce(auth.uid(), new.owner_id) and room_code = new.room_code
    and tstzrange(starts_at, ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)');
  return new;
end $$;
create trigger clear_own_hold after insert or update of starts_at, ends_at, room_code on public.bookings
  for each row execute function public._clear_own_hold();
revoke execute on function public._clear_own_hold() from public, anon, authenticated;

create or replace function public.place_hold(p_room text, p_starts timestamptz, p_ends timestamptz, p_booking_id uuid default null)
returns public.holds language plpgsql security definer set search_path = public as $$
declare v holds;
begin
  if auth.uid() is null then perform raise_err('NOT_FOUND'); end if;
  if p_ends <= p_starts then perform raise_err('INVALID_RANGE'); end if;
  delete from holds where user_id = auth.uid();
  if exists (select 1 from holds h where h.room_code = p_room and h.expires_at > now()
             and tstzrange(h.starts_at, h.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')) then
    perform raise_err('ROOM_HELD');
  end if;
  if exists (select 1 from bookings b where b.room_code = p_room and b.status in ('confirmed', 'checked_in')
             and b.id is distinct from p_booking_id
             and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')) then
    perform raise_err('ROOM_TAKEN');
  end if;
  insert into holds (room_code, starts_at, ends_at, user_id, booking_id, expires_at)
  values (p_room, p_starts, p_ends, auth.uid(), p_booking_id, now() + interval '5 minutes')
  returning * into v;
  return v;
exception when foreign_key_violation then perform raise_err('NOT_FOUND');
end $$;

create or replace function public.renew_hold(p_id uuid)
returns public.holds language plpgsql security definer set search_path = public as $$
declare v holds;
begin
  select * into v from holds where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.user_id is distinct from auth.uid() then perform raise_err('NOT_OWNER'); end if;
  update holds set expires_at = now() + interval '5 minutes' where id = p_id returning * into v;
  return v;
end $$;

create or replace function public.release_hold(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from holds where id = p_id;
  if v_owner is null then return; end if;
  if v_owner is distinct from auth.uid() then perform raise_err('NOT_OWNER'); end if;
  delete from holds where id = p_id;
end $$;

revoke execute on function public.place_hold(text, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.renew_hold(uuid) from public, anon;
revoke execute on function public.release_hold(uuid) from public, anon;
grant execute on function public.place_hold(text, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.renew_hold(uuid) to authenticated;
grant execute on function public.release_hold(uuid) to authenticated;

select cron.schedule('purge-holds', '*/5 * * * *', 'delete from public.holds where expires_at < now()');

alter publication supabase_realtime add table public.bookings, public.holds;
