-- Booking actions (create / edit / cancel) and read access. All writes go through these functions.

alter table public.bookings enable row level security;
create policy bookings_read on public.bookings for select to authenticated using (true);

create or replace function public.create_booking(p_room text, p_starts timestamptz, p_ends timestamptz, p_title text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  if auth.uid() is null then perform raise_err('NOT_FOUND'); end if;
  insert into bookings (room_code, owner_id, title, starts_at, ends_at, created_by)
  values (p_room, auth.uid(), trim(p_title), p_starts, p_ends, auth.uid())
  returning * into v;
  return v;
exception
  when exclusion_violation then perform raise_err('ROOM_TAKEN');
  when foreign_key_violation then perform raise_err('NOT_FOUND');
end $$;

create or replace function public.update_booking(p_id uuid, p_room text, p_starts timestamptz, p_ends timestamptz, p_title text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  select * into v from bookings where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status <> 'confirmed' then perform raise_err('NOT_ACTIVE'); end if;
  update bookings set room_code = p_room, starts_at = p_starts, ends_at = p_ends, title = trim(p_title)
  where id = p_id returning * into v;
  return v;
exception
  when exclusion_violation then perform raise_err('ROOM_TAKEN');
  when foreign_key_violation then perform raise_err('NOT_FOUND');
end $$;

create or replace function public.cancel_booking(p_id uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v bookings;
begin
  select * into v from bookings where id = p_id for update;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  if v.owner_id is distinct from auth.uid() and not is_admin() then perform raise_err('NOT_OWNER'); end if;
  if v.status not in ('confirmed', 'checked_in') or v.ends_at <= now() then perform raise_err('NOT_ACTIVE'); end if;
  update bookings set status = 'cancelled',
         cancelled_reason = case when v.owner_id = auth.uid() then 'by_owner' else 'by_admin' end
  where id = p_id returning * into v;
  return v;
end $$;

create view public.booking_details with (security_invoker = true) as
select b.*, r.name_en as room_name_en, r.name_th as room_name_th, r.building, r.floor, r.size_class,
       p.display_name as owner_name, p.department as owner_department, p.email as owner_email
from public.bookings b
join public.rooms r on r.code = b.room_code
join public.profiles p on p.id = b.owner_id;

revoke execute on function public.create_booking(text, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.update_booking(uuid, text, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.create_booking(text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.update_booking(uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
revoke all on public.booking_details from anon;
