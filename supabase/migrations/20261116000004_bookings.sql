-- Bookings, booking rules, and the no-double-booking constraint.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms,
  owner_id uuid not null references public.profiles,
  series_id uuid,
  title text not null check (length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'no_show', 'cancelled')),
  checked_in_at timestamptz,
  cancelled_reason text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  constraint bookings_no_overlap exclude using gist (
    room_code with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'checked_in'))
);

create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_owner_idx on public.bookings (owner_id, starts_at);

create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s timestamp := new.starts_at at time zone 'Asia/Bangkok';
  e timestamp := new.ends_at at time zone 'Asia/Bangkok';
  privileged boolean;
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

create trigger validate_booking before insert or update of starts_at, ends_at, room_code on public.bookings
  for each row execute function public.validate_booking();

revoke execute on function public.validate_booking() from public, anon, authenticated;
