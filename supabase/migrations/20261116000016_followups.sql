-- Follow-ups agreed with Sunpawat after the review (16 Nov 2026):
--  * (b) a missed booking that was handed to someone who has not yet seen it does not count towards a ban
--  * the title / end time of a booking can be changed after it has started (start and room cannot)
--  * the no-show count does not go up again while the person is already banned
--  * ban status is private: colleagues cannot read it; my_profile() returns your own
--  * repeat rules: duplicate weekdays counted once; a bad interval gives BAD_RULE

alter table public.bookings add column handover_unseen boolean not null default false;

-- Bookings validation: when start and room are unchanged (title / end edits), skip the "new booking" rules.
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

create or replace function public.update_booking(p_id uuid, p_room text, p_starts timestamptz, p_ends timestamptz, p_title text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  select * into v from bookings where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status not in ('confirmed', 'checked_in')
     or (v.status = 'checked_in' and (p_room <> v.room_code or p_starts <> v.starts_at)) then
    perform raise_err('NOT_ACTIVE');
  end if;
  update bookings set room_code = p_room, starts_at = p_starts, ends_at = p_ends, title = trim(p_title)
  where id = p_id returning * into v;
  return v;
exception
  when exclusion_violation then perform raise_err('ROOM_TAKEN');
  when foreign_key_violation then perform raise_err('NOT_FOUND');
end $$;

-- Handover marks the moved bookings as not yet seen by their new owner.
create or replace function public.hand_over(p_booking_id uuid, p_whole_series boolean, p_to_email text)
returns int language plpgsql security definer set search_path = public as $$
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
  if rcpt.id is null or rcpt.is_demo then perform raise_err('RECIPIENT_NOT_FOUND'); end if;
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

-- Called by the app when it has shown the person the bookings handed to them.
create or replace function public.acknowledge_handovers() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set handover_unseen = false where owner_id = auth.uid() and handover_unseen;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.process_no_shows(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  streak int;
  n int := 0;
  cancelled int;
  missed jsonb;
  unseen boolean;
begin
  perform _auto_checkin_demo(p_now);
  for r in
    select id, owner_id from bookings
    where status = 'confirmed' and starts_at + interval '15 minutes' <= p_now
    order by starts_at
    for update skip locked
  loop
    update bookings set status = 'no_show' where id = r.id and status = 'confirmed'
    returning handover_unseen into unseen;
    if not found then continue; end if;
    n := n + 1;
    if unseen then continue; end if;   -- handed over and not yet seen: released, but not counted

    update profiles set no_show_streak = no_show_streak + 1
    where id = r.owner_id and (banned_until is null or banned_until <= p_now)
    returning no_show_streak into streak;
    if not found then continue; end if;   -- already banned: don't count again

    if streak >= 2 then
      select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]') into missed from (
        select jsonb_build_object('booking_id', b.id, 'room_code', b.room_code, 'name_en', rm.name_en,
                                  'name_th', rm.name_th, 'title', b.title,
                                  'starts_at', b.starts_at, 'ends_at', b.ends_at) as x
        from bookings b join rooms rm on rm.code = b.room_code
        where b.owner_id = r.owner_id and b.status = 'no_show' and not b.handover_unseen
        order by b.starts_at desc
        limit 2
      ) last_two;

      update bookings set status = 'cancelled', cancelled_reason = 'ban'
      where owner_id = r.owner_id and status = 'confirmed' and starts_at > p_now;
      get diagnostics cancelled = row_count;

      update profiles set banned_until = p_now + interval '4 hours', no_show_streak = 0 where id = r.owner_id;
      insert into bans (user_id, starts_at, ends_at, missed, cancelled_count)
      values (r.owner_id, p_now, p_now + interval '4 hours', missed, cancelled);
    end if;
  end loop;
  return n;
end $$;

-- Ban status is private.
revoke select on public.profiles from authenticated, anon;
grant select (id, email, display_name, department, role, created_at) on public.profiles to authenticated;

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;

-- Repeat rules: duplicate weekdays counted once; a bad interval or weekday gives BAD_RULE.
create or replace function public._series_dates(p_first date, p_rule jsonb)
returns table (day date, label text) language plpgsql immutable set search_path = public as $$
declare
  freq text := p_rule ->> 'freq';
  step int;
  until_d date;
  wdays int[];
  d date; wk date; k int := 0; y int; mo int;
begin
  begin
    step := coalesce((p_rule ->> 'interval')::int, 1);
    until_d := (p_rule ->> 'until')::date;
    if freq = 'weekly' then
      select array_agg(distinct x::int) into wdays from jsonb_array_elements_text(p_rule -> 'weekdays') x;
    end if;
  exception when others then
    perform raise_err('BAD_RULE');
  end;
  if freq is null or freq not in ('daily', 'weekly', 'monthly') or step < 1
     or until_d is null or until_d < p_first or until_d > p_first + 732 then
    perform raise_err('BAD_RULE');
  end if;

  if freq = 'daily' then
    d := p_first;
    while d <= until_d loop
      if extract(isodow from d) < 6 then day := d; label := d::text; return next; end if;
      d := d + step;
    end loop;

  elsif freq = 'weekly' then
    if wdays is null or exists (select 1 from unnest(wdays) w where w not between 1 and 7) then
      perform raise_err('BAD_RULE');
    end if;
    wk := p_first - (extract(isodow from p_first)::int - 1);
    while wk <= until_d loop
      for d in select wk + (w - 1) from unnest(wdays) w order by w loop
        if d between p_first and until_d then day := d; label := d::text; return next; end if;
      end loop;
      wk := wk + 7 * step;
    end loop;

  else
    loop
      mo := extract(month from (date_trunc('month', p_first) + make_interval(months => k * step)))::int;
      y := extract(year from (date_trunc('month', p_first) + make_interval(months => k * step)))::int;
      exit when make_date(y, mo, 1) > until_d;
      label := format('%s-%s-%s', y, lpad(mo::text, 2, '0'), lpad(extract(day from p_first)::text, 2, '0'));
      begin
        day := make_date(y, mo, extract(day from p_first)::int);
      exception when others then day := null;
      end;
      if day is null or day <= until_d then return next; end if;
      k := k + 1;
    end loop;
  end if;
end $$;

revoke execute on function public.acknowledge_handovers() from public, anon;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.acknowledge_handovers() to authenticated;
grant execute on function public.my_profile() to authenticated;
