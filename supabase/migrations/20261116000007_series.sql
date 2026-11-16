-- Recurring bookings. Each occurrence is an ordinary booking row linked to its series.

create table public.booking_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles,
  room_code text not null references public.rooms,
  title text not null,
  start_time time not null,
  end_time time not null,
  rule jsonb not null,
  first_date date not null,
  created_at timestamptz not null default now()
);

alter table public.bookings
  add constraint bookings_series_fk foreign key (series_id) references public.booking_series (id);
create index bookings_series_idx on public.bookings (series_id);

alter table public.booking_series enable row level security;
create policy booking_series_read on public.booking_series for select to authenticated using (true);

-- Dates a rule produces. Monthly dates that don't exist (e.g. 31 Feb) come back as null with their label.
create or replace function public._series_dates(p_first date, p_rule jsonb)
returns table (day date, label text) language plpgsql immutable as $$
declare
  freq text := p_rule ->> 'freq';
  step int := coalesce((p_rule ->> 'interval')::int, 1);
  until_d date := (p_rule ->> 'until')::date;
  wdays int[];
  d date; wk date; k int := 0; y int; mo int;
begin
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
    select array_agg(x::int) into wdays from jsonb_array_elements_text(p_rule -> 'weekdays') x;
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

create or replace function public.create_series(p_room text, p_title text, p_first_date date,
                                                p_start time, p_end time, p_rule jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  r record;
  bid uuid;
  created jsonb := '[]';
  skipped jsonb := '[]';
  reason text;
begin
  if auth.uid() is null then perform raise_err('NOT_FOUND'); end if;
  if not exists (select 1 from rooms where code = p_room) then perform raise_err('NOT_FOUND'); end if;

  insert into booking_series (owner_id, room_code, title, start_time, end_time, rule, first_date)
  values (auth.uid(), p_room, trim(p_title), p_start, p_end, p_rule, p_first_date)
  returning id into sid;

  for r in select * from _series_dates(p_first_date, p_rule) loop
    if r.day is null then
      skipped := skipped || jsonb_build_object('date', r.label, 'reason', 'BAD_RULE');
      continue;
    end if;
    begin
      insert into bookings (room_code, owner_id, series_id, title, starts_at, ends_at, created_by)
      values (p_room, auth.uid(), sid, trim(p_title),
              (r.day + p_start) at time zone 'Asia/Bangkok', (r.day + p_end) at time zone 'Asia/Bangkok', auth.uid())
      returning id into bid;
      created := created || to_jsonb(bid);
    exception when others then
      reason := case when sqlstate = '23P01' then 'ROOM_TAKEN' else sqlerrm end;
      skipped := skipped || jsonb_build_object('date', r.label, 'reason', reason);
    end;
  end loop;

  if jsonb_array_length(created) = 0 then
    delete from booking_series where id = sid;
    sid := null;
  end if;
  return jsonb_build_object('series_id', sid, 'created', created, 'skipped', skipped);
end $$;

create or replace function public.cancel_series(p_series_id uuid, p_from date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  s booking_series;
  n int;
  from_ts timestamptz;
begin
  select * into s from booking_series where id = p_series_id;
  if s.id is null then perform raise_err('NOT_FOUND'); end if;
  if s.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  from_ts := greatest(now(), coalesce(p_from::timestamp at time zone 'Asia/Bangkok', now()));
  update bookings set status = 'cancelled',
         cancelled_reason = case when s.owner_id = auth.uid() then 'by_owner' else 'by_admin' end
  where series_id = p_series_id and status in ('confirmed', 'checked_in') and starts_at >= from_ts;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public._series_dates(date, jsonb) from public, anon, authenticated;
revoke execute on function public.create_series(text, text, date, time, time, jsonb) from public, anon;
revoke execute on function public.cancel_series(uuid, date) from public, anon;
grant execute on function public.create_series(text, text, date, time, time, jsonb) to authenticated;
grant execute on function public.cancel_series(uuid, date) to authenticated;
