-- Installs supabase/tests/10_review_fixes.test.sql into the test suite.
create or replace function tests.t_10_review_fixes() returns setof text language plpgsql as $TEST$
declare
  a uuid; c uuid; d2 uuid; m uuid; u uuid; x uuid; demo uuid;
  sr jsonb; occ1 uuid; occ2 uuid; past uuid; b1 uuid; b2 uuid; bk uuid; xb uuid; d date; t0 timestamptz;
  ins text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L) returning id$q$;
begin
a := tests.make_user('a10@sahamitproduct.com', 'A10');
c := tests.make_user('c10@sahamitproduct.com', 'C10');
d2 := tests.make_user('d10@sahamitproduct.com', 'D10');
m := tests.make_user('m10@sahamitproduct.com', 'M10', true);
u := tests.make_user('u10@sahamitproduct.com', 'U10');
x := tests.make_user('x10@sahamitproduct.com', 'X10');
demo := tests.make_user('mock.q10@sahamitproduct.com', 'Mock Q');
update profiles set is_demo = true where id = demo;
d := (tests.slot(35, '10:00') at time zone 'Asia/Bangkok')::date;
t0 := d::timestamp at time zone 'Asia/Bangkok';
sr := tests.val(a, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'KT6-2', 'Series', d, '15:00', '16:00',
                json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int], 'until', d + 14)))::jsonb;
occ1 := (sr -> 'created' ->> 0)::uuid;
occ2 := (sr -> 'created' ->> 1)::uuid;
perform tests.val(a, format('select hand_over(%L, false, %L)', occ2, 'c10@sahamitproduct.com'));
return next plan(9);

return next is(tests.try(c, format('select hand_over(%L, true, %L)', occ2, 'd10@sahamitproduct.com')), 'NOT_OWNER', 'holder of one date cannot hand over the whole series');
return next is((select owner_id from booking_series where id = (sr ->> 'series_id')::uuid), a, 'series still belongs to its owner');
perform tests.val(a, format('select cancel_series(%L)', sr ->> 'series_id'));
return next is((select status from bookings where id = occ2), 'confirmed', 'cancelling a series leaves dates handed to others alone');

perform set_config('app.bypass_rules', 'on', true);
execute format(ins, 'KT6-1', a, now() - interval '20 minutes', now() + interval '40 minutes') into past;
perform set_config('app.bypass_rules', 'off', true);
return next is(tests.try(a, format('select hand_over(%L, false, %L)', past, 'c10@sahamitproduct.com')), 'NOT_ACTIVE', 'cannot hand over a booking that has started');

xb := tests.val(a, format('select (create_booking(%L, %L, %L, %L)).id', 'AC2-2', tests.slot(35, '09:00'), tests.slot(35, '10:00'), 'X'))::uuid;
return next is(tests.try(a, format('select hand_over(%L, false, %L)', xb, 'mock.q10@sahamitproduct.com')), 'RECIPIENT_NOT_FOUND', 'cannot hand over to a demo user');

execute format(ins, 'AC6-1', u, t0 + interval '9 hours', t0 + interval '10 hours') into b1;
execute format(ins, 'AC6-2', u, t0 + interval '9 hours', t0 + interval '10 hours') into b2;
execute format(ins, 'KT5-2', u, t0 + interval '11 hours', t0 + interval '12 hours') into bk;
perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
perform _check_in_at(bk, t0 + interval '10 hours 5 minutes');
perform set_config('request.jwt.claims', '', true);
perform process_no_shows(t0 + interval '10 hours 15 minutes');
return next is((select status from bookings where id = bk), 'checked_in', 'a ban does not cancel a booking already checked in');

execute format(ins, 'KT6-1', x, tests.slot(36, '10:00'), tests.slot(36, '11:00')) into xb;
return next is(tests.try(c, format('select admin_remove_user(%L)', x)), 'NOT_ADMIN', 'only admins remove accounts');
return next is(tests.try(m, format('select admin_remove_user(%L)', x)), 'ok', 'admin removes an account that has bookings');
return next ok(not exists (select 1 from profiles where id = x) and not exists (select 1 from bookings where id = xb), 'account and its bookings are gone');

return query select * from finish();

end $TEST$;
revoke execute on function tests.t_10_review_fixes() from public, anon;
