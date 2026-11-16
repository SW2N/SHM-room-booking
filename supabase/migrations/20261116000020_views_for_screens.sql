-- booking_details was created before bookings.handover_unseen existed (a view freezes its columns), so it is rebuilt;
-- hold_details shows who is holding a slot. Both read with the caller's rights (security_invoker).
drop view public.booking_details;
create view public.booking_details with (security_invoker = true) as
select b.id, b.room_code, b.owner_id, b.series_id, b.title, b.starts_at, b.ends_at, b.status, b.checked_in_at,
       b.cancelled_reason, b.created_by, b.created_at, b.handover_unseen,
       r.name_en as room_name_en, r.name_th as room_name_th, r.building, r.floor, r.size_class,
       p.display_name as owner_name, p.department as owner_department, p.email as owner_email
from public.bookings b
join public.rooms r on r.code = b.room_code
join public.profiles p on p.id = b.owner_id;

create view public.hold_details with (security_invoker = true) as
select h.id, h.room_code, h.starts_at, h.ends_at, h.user_id, h.booking_id, h.expires_at, p.display_name as holder_name
from public.holds h
join public.profiles p on p.id = h.user_id;

revoke all on public.booking_details from anon;
revoke all on public.hold_details from anon;
grant select on public.booking_details, public.hold_details to authenticated;
create or replace function tests.t_13_views() returns setof text language plpgsql as $TEST$
declare a uuid; b uuid; s timestamptz; e timestamptz;
begin
a := tests.make_user('a13@sahamitproduct.com', 'A13');
b := tests.make_user('b13@sahamitproduct.com', 'B13');
s := tests.slot(35, '10:00'); e := tests.slot(35, '11:00');
perform tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT6-2', s, e));
return next plan(3);
return next ok(exists (select 1 from information_schema.columns where table_name = 'booking_details' and column_name = 'handover_unseen'), 'booking_details shows handover_unseen');
return next is(tests.val(b, 'select holder_name from hold_details limit 1'), 'A13', 'hold_details shows who is booking');
return next ok(not has_table_privilege('anon', 'public.hold_details', 'select'), 'signed-out visitors cannot read holds');
return query select * from finish();

end $TEST$;
revoke execute on function tests.t_13_views() from public, anon;
