-- Demo (mock) users: their bookings are treated as used, so the scheduled no-show job never bans them
-- or cancels the demo data.
alter table public.profiles add column is_demo boolean not null default false;
update public.profiles set is_demo = true where email like 'mock.%@sahamitproduct.com';

create or replace function public._auto_checkin_demo(p_now timestamptz) returns void
language sql security definer set search_path = public as $$
  update bookings b set status = 'checked_in', checked_in_at = b.starts_at
  from profiles p
  where p.id = b.owner_id and p.is_demo and b.status = 'confirmed' and b.starts_at + interval '15 minutes' <= p_now;
$$;
revoke execute on function public._auto_checkin_demo(timestamptz) from public, anon, authenticated;

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
      where owner_id = r.owner_id and status in ('confirmed', 'checked_in') and starts_at > p_now;
      get diagnostics cancelled = row_count;

      update profiles set banned_until = p_now + interval '4 hours', no_show_streak = 0 where id = r.owner_id;
      insert into bans (user_id, starts_at, ends_at, missed, cancelled_count)
      values (r.owner_id, p_now, p_now + interval '4 hours', missed, cancelled);
    end if;
  end loop;
  return n;
end $$;

