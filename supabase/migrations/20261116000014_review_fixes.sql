-- Fixes from the final review:
--  * whole-series handover and series cancel are limited to the series owner (or an admin), and only touch
--    dates the series owner still holds
--  * no handover once a booking has started, and never to a demo user
--  * a ban no longer cancels bookings the person has already checked into
--  * admins can remove an account together with its bookings (spec §12: remove someone registered with a colleague's address)

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
      update bookings set owner_id = rcpt.id
      where series_id = s.id and owner_id = s.owner_id and status = 'confirmed' and starts_at > now()
      returning id
    ) select array_agg(id) into ids from moved;
    update booking_series set owner_id = rcpt.id where id = s.id;
  else
    update bookings set owner_id = rcpt.id where id = v.id;
    ids := array[v.id];
  end if;

  insert into handovers (from_user, to_user, booking_ids, series_id, done_by)
  values (v.owner_id, rcpt.id, coalesce(ids, '{}'), case when p_whole_series then v.series_id end, auth.uid());
  return coalesce(array_length(ids, 1), 0);
end $$;

create or replace function public.cancel_series(p_series_id uuid, p_from date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  s booking_series;
  n int;
  from_ts timestamptz;
  admin boolean := is_admin();
begin
  select * into s from booking_series where id = p_series_id;
  if s.id is null then perform raise_err('NOT_FOUND'); end if;
  if s.owner_id is distinct from auth.uid() and not admin then perform raise_err('NOT_OWNER'); end if;
  from_ts := greatest(now(), coalesce(p_from::timestamp at time zone 'Asia/Bangkok', now()));
  update bookings set status = 'cancelled',
         cancelled_reason = case when s.owner_id = auth.uid() then 'by_owner' else 'by_admin' end
  where series_id = p_series_id and status in ('confirmed', 'checked_in') and starts_at >= from_ts
    and (owner_id = s.owner_id or (admin and s.owner_id is distinct from auth.uid()));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_remove_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then perform raise_err('NOT_ADMIN'); end if;
  if p_user = auth.uid() then perform raise_err('NOT_ALLOWED'); end if;
  if not exists (select 1 from profiles where id = p_user) then perform raise_err('NOT_FOUND'); end if;
  delete from handovers where p_user in (from_user, to_user, done_by)
     or series_id in (select id from booking_series where owner_id = p_user);
  update bans set lifted_by = null where lifted_by = p_user;
  delete from bans where user_id = p_user;
  update bookings set created_by = null where created_by = p_user and owner_id <> p_user;
  update bookings set series_id = null
  where owner_id <> p_user and series_id in (select id from booking_series where owner_id = p_user);
  delete from bookings where owner_id = p_user;
  delete from booking_series where owner_id = p_user;
  delete from auth.users where id = p_user;   -- the profile goes with it (on delete cascade)
end $$;
revoke execute on function public.admin_remove_user(uuid) from public, anon;
grant execute on function public.admin_remove_user(uuid) to authenticated;

create or replace function public.process_no_shows(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  streak int;
  n int := 0;
  cancelled int;
  missed jsonb;
begin
  perform _auto_checkin_demo(p_now);
  for r in
    select id, owner_id from bookings
    where status = 'confirmed' and starts_at + interval '15 minutes' <= p_now
    order by starts_at
    for update skip locked
  loop
    update bookings set status = 'no_show' where id = r.id and status = 'confirmed';
    if not found then continue; end if;
    n := n + 1;

    update profiles set no_show_streak = no_show_streak + 1 where id = r.owner_id
    returning no_show_streak into streak;

    if streak >= 2 then
      select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]') into missed from (
        select jsonb_build_object('booking_id', b.id, 'room_code', b.room_code, 'name_en', rm.name_en,
                                  'name_th', rm.name_th, 'title', b.title,
                                  'starts_at', b.starts_at, 'ends_at', b.ends_at) as x
        from bookings b join rooms rm on rm.code = b.room_code
        where b.owner_id = r.owner_id and b.status = 'no_show'
        order by b.starts_at desc
        limit 2
      ) last_two;

      update bookings set status = 'cancelled', cancelled_reason = 'ban'
      where owner_id = r.owner_id and status = 'confirmed' and starts_at > p_now;   -- checked-in bookings are kept
      get diagnostics cancelled = row_count;

      update profiles set banned_until = p_now + interval '4 hours', no_show_streak = 0 where id = r.owner_id;
      insert into bans (user_id, starts_at, ends_at, missed, cancelled_count)
      values (r.owner_id, p_now, p_now + interval '4 hours', missed, cancelled);
    end if;
  end loop;
  return n;
end $$;

