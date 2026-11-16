-- No limit on how many holds one person keeps: one admin often books rooms for a whole team.
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
