-- Handover: the owner (or an admin) gives one booking or a whole series to another SHM user. Logged.

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles,
  to_user uuid not null references public.profiles,
  booking_ids uuid[] not null,
  series_id uuid references public.booking_series,
  done_by uuid references public.profiles,
  done_at timestamptz not null default now()
);

alter table public.handovers enable row level security;
create policy handovers_read on public.handovers for select to authenticated
  using (auth.uid() in (from_user, to_user) or public.is_admin());

create or replace function public.hand_over(p_booking_id uuid, p_whole_series boolean, p_to_email text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v bookings;
  rcpt profiles;
  ids uuid[];
begin
  select * into v from bookings where id = p_booking_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status <> 'confirmed' then perform raise_err('NOT_ACTIVE'); end if;

  select * into rcpt from profiles where email = lower(trim(p_to_email));
  if rcpt.id is null then perform raise_err('RECIPIENT_NOT_FOUND'); end if;
  if rcpt.banned_until > now() then perform raise_err('RECIPIENT_BANNED'); end if;

  if p_whole_series and v.series_id is not null then
    with moved as (
      update bookings set owner_id = rcpt.id
      where series_id = v.series_id and owner_id = v.owner_id and status = 'confirmed' and starts_at > now()
      returning id
    ) select array_agg(id) into ids from moved;
    update booking_series set owner_id = rcpt.id where id = v.series_id;
  else
    update bookings set owner_id = rcpt.id where id = v.id;
    ids := array[v.id];
  end if;

  insert into handovers (from_user, to_user, booking_ids, series_id, done_by)
  values (v.owner_id, rcpt.id, coalesce(ids, '{}'), case when p_whole_series then v.series_id end, auth.uid());
  return coalesce(array_length(ids, 1), 0);
end $$;

revoke execute on function public.hand_over(uuid, boolean, text) from public, anon;
grant execute on function public.hand_over(uuid, boolean, text) to authenticated;
