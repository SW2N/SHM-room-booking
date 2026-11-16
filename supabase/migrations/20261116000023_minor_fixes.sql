-- Minor fixes after the Phase 2 review (16 Nov 2026):
--  * extending a booking's end time respects other people's holds (the hold check now runs before the
--    "same start and room" shortcut)
--  * booking_details shows the series owner, so the app offers "whole series" only to them (or an admin)
--  * each open form keeps its own hold (two tabs no longer take each other's), at most 3 live holds per person

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



drop view public.booking_details;
create view public.booking_details with (security_invoker = true) as
select b.id, b.room_code, b.owner_id, b.series_id, b.title, b.starts_at, b.ends_at, b.status, b.checked_in_at,
       b.cancelled_reason, b.created_by, b.created_at, b.handover_unseen,
       r.name_en as room_name_en, r.name_th as room_name_th, r.building, r.floor, r.size_class,
       p.display_name as owner_name, p.department as owner_department, p.email as owner_email,
       s.owner_id as series_owner_id
from public.bookings b
join public.rooms r on r.code = b.room_code
join public.profiles p on p.id = b.owner_id
left join public.booking_series s on s.id = b.series_id;
revoke all on public.booking_details from anon;
grant select on public.booking_details to authenticated;

create or replace function public.place_hold(p_room text, p_starts timestamptz, p_ends timestamptz, p_booking_id uuid default null)
returns public.holds language plpgsql security definer set search_path = public as $$
declare
  v holds;
  s timestamp := p_starts at time zone 'Asia/Bangkok';
  e timestamp := p_ends at time zone 'Asia/Bangkok';
begin
  if auth.uid() is null then perform raise_err('NOT_FOUND'); end if;
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
  -- Each open form (tab, device) keeps its own hold; a person keeps at most 3 live holds.
  delete from holds where expires_at <= now() and (user_id = auth.uid() or room_code = p_room);
  delete from holds where id in (select id from holds where user_id = auth.uid() order by created_at desc offset 2);
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

