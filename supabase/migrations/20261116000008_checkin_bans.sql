-- Check-in, automatic no-show release, and the 2-in-a-row / 4-hour ban.

create table public.bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  missed jsonb not null,
  cancelled_count int not null,
  lifted_by uuid references public.profiles,
  lifted_at timestamptz
);
create index bans_user_idx on public.bans (user_id, starts_at desc);

alter table public.bans enable row level security;
create policy bans_read on public.bans for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public._check_in_at(p_id uuid, p_now timestamptz)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  select * into v from bookings where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status <> 'confirmed' then perform raise_err('NOT_ACTIVE'); end if;
  if p_now < v.starts_at - interval '60 minutes' or p_now > v.starts_at + interval '15 minutes' then
    perform raise_err('CHECKIN_WINDOW');
  end if;
  update bookings set status = 'checked_in', checked_in_at = p_now where id = p_id returning * into v;
  update profiles set no_show_streak = 0 where id = v.owner_id;
  return v;
end $$;

create or replace function public.check_in(p_id uuid)
returns public.bookings language sql security definer set search_path = public as $$
  select public._check_in_at(p_id, now());
$$;

create or replace function public.process_no_shows(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  streak int;
  n int := 0;
  cancelled int;
  missed jsonb;
begin
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

create or replace function public.admin_lift_ban(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then perform raise_err('NOT_ADMIN'); end if;
  update profiles set banned_until = null where id = p_user;
  update bans set lifted_by = auth.uid(), lifted_at = now()
  where user_id = p_user and lifted_at is null and ends_at > now();
end $$;

revoke execute on function public._check_in_at(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.process_no_shows(timestamptz) from public, anon, authenticated;
revoke execute on function public.check_in(uuid) from public, anon;
revoke execute on function public.admin_lift_ban(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;
grant execute on function public.admin_lift_ban(uuid) to authenticated;

select cron.schedule('process-no-shows', '*/5 * * * *', 'select public.process_no_shows()');
