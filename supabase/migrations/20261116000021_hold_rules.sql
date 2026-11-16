-- Fixes from the Phase 2 review:
--  * a hold follows the booking rules (same day, 08:00-20:00, 30-minute steps, not in the past;
--    weekends, holidays, bans and the 3-month limit for non-admins)
--  * placing a hold is serialised per room, and clears lapsed holds first, so two people can't both hold one slot
--  * a lapsed hold that someone else has taken over can't be revived; holds live at most 30 minutes in total
--  * acknowledge_handovers can mark only the bookings the app actually showed

alter table public.holds add column created_at timestamptz not null default now();

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
  delete from holds where user_id = auth.uid() or (room_code = p_room and expires_at <= now());
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
  if v.created_at < now() - interval '30 minutes' then
    delete from holds where id = p_id;
    perform raise_err('HOLD_EXPIRED');
  end if;
  if v.expires_at <= now() then
    perform pg_advisory_xact_lock(hashtext('hold:' || v.room_code));
    if exists (select 1 from holds h where h.id <> v.id and h.room_code = v.room_code and h.expires_at > now()
               and tstzrange(h.starts_at, h.ends_at, '[)') && tstzrange(v.starts_at, v.ends_at, '[)')) then
      delete from holds where id = p_id;
      perform raise_err('ROOM_HELD');
    end if;
  end if;
  update holds set expires_at = now() + interval '5 minutes' where id = p_id returning * into v;
  return v;
end $$;

drop function public.acknowledge_handovers();
create function public.acknowledge_handovers(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set handover_unseen = false
  where owner_id = auth.uid() and handover_unseen and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.acknowledge_handovers(uuid[]) from public, anon;
grant execute on function public.acknowledge_handovers(uuid[]) to authenticated;
