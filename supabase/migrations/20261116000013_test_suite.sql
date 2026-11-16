-- Installs every supabase/tests/*.test.sql as tests.t_<name>() plus tests.suite(). Run all: select * from tests.suite(); rollback;
--   select * from tests.suite(); rollback;
create or replace function tests.t_02_reference() returns setof text language plpgsql as $TEST$
begin
return next plan(9);

return next is((select count(*) from rooms), 9::bigint, '9 rooms');
return next is((select size_class from rooms where code = 'KT5-3'), 'XL', 'Champ is XL');
return next is((select size_class from rooms where code = 'AC6-2'), 'L', 'Canteen is L');

return next throws_ok(
  $$ insert into auth.users (id, aud, role, email) values (gen_random_uuid(), 'authenticated', 'authenticated', 'x@gmail.com') $$,
  'NOT_SHM_EMAIL', 'non-SHM email is rejected');

return next lives_ok($$ select tests.make_user('Somchai@SahamitProduct.com', 'Somchai') $$, 'SHM email (any case) is accepted');
return next is((select display_name from profiles where email ilike 'somchai@%'), 'Somchai', 'profile created from sign-up data');

perform tests.act_as((select id from profiles where email ilike 'somchai@%'));
perform update_my_settings('en', 'CE', null);
perform tests.act_as_postgres();
return next is((select lang || '/' || year_style || '/' || date_format from profiles where email ilike 'somchai@%'),
               'en/CE/long', 'settings saved; null leaves date_format unchanged');

perform tests.act_as((select id from profiles where email ilike 'somchai@%'));
update profiles set role = 'admin';
return next is((select count(*) from rooms), 9::bigint, 'signed-in users can read rooms');
perform tests.act_as_postgres();
return next is((select role from profiles where email ilike 'somchai@%'), 'user', 'user cannot make themselves admin');

return query select * from finish();

end $TEST$;
create or replace function tests.t_03_bookings() returns setof text language plpgsql as $TEST$
declare
  u uuid; m uuid; d date; first_id uuid;
  b text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L)$q$;
begin
u := tests.make_user('u3@sahamitproduct.com', 'U3');
m := tests.make_user('m3@sahamitproduct.com', 'M3', true);
return next plan(16);

return next lives_ok(format(b, 'KT5-3', u, tests.slot(35,'10:00'), tests.slot(35,'11:00')), '10:00-11:00 ok');
return next lives_ok(format(b, 'KT5-2', u, tests.slot(35,'08:00'), tests.slot(35,'08:30')), '08:00 start ok (01:00 UTC)');
return next lives_ok(format(b, 'KT5-2', u, tests.slot(35,'19:30'), tests.slot(35,'20:00')), 'ending exactly 20:00 ok');
return next throws_ok(format(b, 'KT5-1', u, tests.slot(35,'19:30'), tests.slot(35,'20:30')), 'OUTSIDE_HOURS', 'past 20:00 rejected');
return next throws_ok(format(b, 'KT5-1', u, tests.slot(35,'07:30'), tests.slot(35,'08:30')), 'OUTSIDE_HOURS', 'before 08:00 rejected');
return next throws_ok(format(b, 'KT5-1', u, tests.slot(35,'19:30'), tests.slot(35,'19:30') + interval '12 hours 30 minutes'), 'OUTSIDE_HOURS', 'crossing midnight rejected');
return next throws_ok(format(b, 'KT5-1', u, tests.slot(35,'10:15'), tests.slot(35,'11:00')), 'NOT_ALIGNED', 'not on :00/:30 rejected');
return next throws_ok(format(b, 'KT5-1', u, tests.slot(35,'11:00'), tests.slot(35,'10:00')), 'INVALID_RANGE', 'end before start rejected');

d := (now() at time zone 'Asia/Bangkok')::date + 35;
while extract(isodow from d) <> 6 loop d := d + 1; end loop;
return next throws_ok(format(b, 'KT5-1', u, (d + time '10:00') at time zone 'Asia/Bangkok', (d + time '11:00') at time zone 'Asia/Bangkok'), 'WEEKEND', 'Saturday rejected for users');
return next lives_ok(format(b, 'KT5-1', m, (d + time '10:00') at time zone 'Asia/Bangkok', (d + time '11:00') at time zone 'Asia/Bangkok'), 'Saturday ok for admin');

d := (tests.slot(48,'10:00') at time zone 'Asia/Bangkok')::date;
insert into holidays (day, name_th) values (d, 'ทดสอบ');
return next throws_ok(format(b, 'KT5-1', u, (d + time '10:00') at time zone 'Asia/Bangkok', (d + time '11:00') at time zone 'Asia/Bangkok'), 'HOLIDAY', 'holiday rejected');

return next throws_ok(format(b, 'KT5-1', u, tests.slot(125,'10:00'), tests.slot(125,'11:00')), 'TOO_FAR_AHEAD', 'more than 3 months ahead rejected');
return next lives_ok(format(b, 'KT5-1', m, tests.slot(125,'10:00'), tests.slot(125,'11:00')), 'admin can book beyond 3 months');

return next throws_ok(format(b, 'KT5-1', m, tests.slot(-7,'10:00'), tests.slot(-7,'11:00')), 'IN_PAST', 'past start rejected even for admin');

return next throws_ok(format(b, 'KT5-3', m, tests.slot(35,'10:30'), tests.slot(35,'11:30')), '23P01', null, 'overlap rejected');

update bookings set status = 'cancelled' where room_code = 'KT5-3' and starts_at = tests.slot(35,'10:00');
return next lives_ok(format(b, 'KT5-3', m, tests.slot(35,'10:30'), tests.slot(35,'11:30')), 'cancelled booking frees the slot');

return query select * from finish();

end $TEST$;
create or replace function tests.t_04_booking_rpcs() returns setof text language plpgsql as $TEST$
declare
  a uuid; b uuid; m uuid; bid uuid;
  s1 timestamptz; e1 timestamptz;
begin
a := tests.make_user('a4@sahamitproduct.com', 'A4');
b := tests.make_user('b4@sahamitproduct.com', 'B4');
m := tests.make_user('m4@sahamitproduct.com', 'M4', true);
s1 := tests.slot(35, '10:00'); e1 := tests.slot(35, '11:00');
return next plan(11);

bid := tests.val(a, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-3', s1, e1, 'Sales'))::uuid;
return next ok(bid is not null, 'user books a free slot');
return next is((select owner_id from bookings where id = bid), a, 'booker is the owner');
return next is(tests.try(b, format('select create_booking(%L, %L, %L, %L)', 'KT5-3', s1, e1, 'X')), 'ROOM_TAKEN', 'taken slot gives ROOM_TAKEN');
return next is(tests.try(b, format('select cancel_booking(%L)', bid)), 'NOT_OWNER', 'others cannot cancel');
return next is(tests.try(b, format('select update_booking(%L, %L, %L, %L, %L)', bid, 'KT5-3', s1, e1, 'X')), 'NOT_OWNER', 'others cannot edit');
return next is(tests.try(a, format('select update_booking(%L, %L, %L, %L, %L)', bid, 'KT5-3', s1 + interval '30 minutes', e1 + interval '30 minutes', 'Sales')),
               'ok', 'moving 30 min over its own old time works');
return next is(tests.try(a, format($q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values ('KT5-1', %L, 'X', %L, %L)$q$, a, s1, e1)),
               'new row violates row-level security policy for table "bookings"', 'direct insert blocked');
return next ok(tests.val(b, 'select count(*) from booking_details where owner_name = ''A4''')::int = 1, 'everyone sees bookings with owner name');
return next is(tests.try(m, format('select cancel_booking(%L)', bid)), 'ok', 'admin can cancel anyone''s booking');
return next is((select cancelled_reason from bookings where id = bid), 'by_admin', 'reason recorded');
return next is(tests.try(a, format('select cancel_booking(%L)', bid)), 'NOT_ACTIVE', 'cannot cancel twice');

return query select * from finish();

end $TEST$;
create or replace function tests.t_05_series() returns setof text language plpgsql as $TEST$
declare
  a uuid; b uuid; m uuid; d date; r1 jsonb; r2 jsonb; r jsonb;
  cs text := 'select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text';
begin
a := tests.make_user('a5@sahamitproduct.com', 'A5');
b := tests.make_user('b5@sahamitproduct.com', 'B5');
m := tests.make_user('m5@sahamitproduct.com', 'M5', true);
d := (now() at time zone 'Asia/Bangkok')::date + 35;
while extract(isodow from d) <> 2 loop d := d + 1; end loop;   -- a Tuesday at least a week ahead
return next plan(10);

r1 := tests.val(a, format(cs, 'KT5-3', 'MM Meeting', d, '09:30', '12:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 35)))::jsonb;
return next is(jsonb_array_length(r1 -> 'created'), 6, 'weekly Tuesday x6 creates 6');
return next is(jsonb_array_length(r1 -> 'skipped'), 0, 'nothing skipped');

perform tests.val(b, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-1', (d + 14 + time '10:00') at time zone 'Asia/Bangkok', (d + 14 + time '11:00') at time zone 'Asia/Bangkok', 'Blocker'));
r2 := tests.val(a, format(cs, 'KT5-1', 'NF team', d, '09:30', '12:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 35)))::jsonb;
return next is(jsonb_array_length(r2 -> 'created'), 5, 'clashing week skipped, rest booked');
return next is(r2 -> 'skipped' -> 0 ->> 'reason', 'ROOM_TAKEN', 'skip reason is ROOM_TAKEN');

r := tests.val(a, format(cs, 'KT6-1', 'Long', d, '13:00', '14:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 150)))::jsonb;
return next ok(exists (select 1 from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'TOO_FAR_AHEAD'), 'user: dates past 3 months skipped');
r := tests.val(m, format(cs, 'KT6-2', 'Long', d, '13:00', '14:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 150)))::jsonb;
return next ok(not exists (select 1 from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'TOO_FAR_AHEAD'), 'admin: no 3-month limit');

return next is(tests.try(a, format(cs, 'KT6-2', 'Bad', d, '09:00', '10:00', '{"freq":"yearly","until":"2027-12-31"}')), 'BAD_RULE', 'unknown rule rejected');
return next is(tests.try(b, format('select cancel_series(%L)', r1 ->> 'series_id')), 'NOT_OWNER', 'others cannot cancel a series');
return next is(tests.val(a, format('select cancel_series(%L)', r1 ->> 'series_id')), '6', 'owner cancels all 6');
return next is(tests.try(b, format('select create_booking(%L, %L, %L, %L)', 'KT5-3', (d + time '09:30') at time zone 'Asia/Bangkok', (d + time '12:00') at time zone 'Asia/Bangkok', 'Mine')),
               'ok', 'cancelled series frees its slots');

return query select * from finish();

end $TEST$;
create or replace function tests.t_06_checkin_bans() returns setof text language plpgsql as $TEST$
declare
  u uuid; o uuid; m uuid; d date;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; bp uuid; bc uuid; sr jsonb; occ uuid;
  ins text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L) returning id$q$;
  t0 timestamptz;
begin
-- check-in helper: runs _check_in_at with u's sign-in, returns 'ok' or the error code
execute $f$create or replace function tests.ci(p_user uuid, p_id uuid, p_now timestamptz) returns text language plpgsql as $g$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform public._check_in_at(p_id, p_now);
  perform set_config('request.jwt.claims', '', true);
  return 'ok';
exception when others then
  perform set_config('request.jwt.claims', '', true);
  return sqlerrm;
end $g$$f$;

u := tests.make_user('u6@sahamitproduct.com', 'U6');
o := tests.make_user('o6@sahamitproduct.com', 'O6');
m := tests.make_user('m6@sahamitproduct.com', 'M6', true);
d := (tests.slot(35, '09:00') at time zone 'Asia/Bangkok')::date;
t0 := d::timestamp at time zone 'Asia/Bangkok';   -- midnight Bangkok on day d
execute format(ins, 'KT5-1', u, t0 + interval '9 hours',  t0 + interval '10 hours') into b1;
execute format(ins, 'KT5-1', u, t0 + interval '10 hours', t0 + interval '11 hours') into b2;
execute format(ins, 'KT5-1', u, t0 + interval '11 hours', t0 + interval '12 hours') into b3;
execute format(ins, 'KT5-1', u, t0 + interval '13 hours', t0 + interval '14 hours') into b4;
execute format(ins, 'KT5-3', u, t0 + interval '13 hours', t0 + interval '14 hours') into b5;
execute format(ins, 'KT5-2', u, t0 + interval '13.5 hours', t0 + interval '15 hours') into bp;
execute format(ins, 'AC2-1', u, t0 + interval '9 hours',  t0 + interval '10 hours') into bc;
update bookings set status = 'cancelled' where id = bc;
sr := tests.val(u, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'KT6-1', 'Weekly', d, '16:00', '17:00',
                json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int], 'until', d + 14)))::jsonb;
occ := (sr -> 'created' ->> 0)::uuid;
return next plan(19);

return next is(tests.ci(u, b1, t0 + interval '9 hours' - interval '61 minutes'), 'CHECKIN_WINDOW', 'too early');
return next is(tests.ci(u, b1, t0 + interval '9 hours' - interval '60 minutes'), 'ok', 'exactly 1 hour before is fine');
return next is(tests.ci(u, b2, t0 + interval '10 hours' + interval '16 minutes'), 'CHECKIN_WINDOW', 'too late');
return next is(tests.ci(o, b2, t0 + interval '10 hours'), 'NOT_OWNER', 'only the owner checks in');
return next is(tests.ci(u, bc, t0 + interval '9 hours'), 'NOT_ACTIVE', 'cannot check in to a cancelled booking');

return next is(process_no_shows(t0 + interval '10 hours 15 minutes'), 1, 'one no-show found');
return next is((select status || '/' || p.no_show_streak || '/' || coalesce(p.banned_until::text, 'none') from bookings b join profiles p on p.id = b.owner_id where b.id = b2),
               'no_show/1/none', 'first no-show: streak 1, no ban');
return next is(tests.try(o, format('select create_booking(%L, %L, %L, %L)', 'KT5-1', t0 + interval '10 hours', t0 + interval '11 hours', 'Grab')),
               'ok', 'released room can be booked by someone else');
return next is(tests.ci(u, b3, t0 + interval '11 hours'), 'ok', 'check-in');
return next is((select no_show_streak from profiles where id = u), 0, 'check-in resets the streak');

perform tests.ci(u, bp, t0 + interval '13.5 hours');
perform process_no_shows(t0 + interval '14 hours 15 minutes');
return next is((select banned_until from profiles where id = u), t0 + interval '18 hours 15 minutes', '2 no-shows in a row: banned 4 hours');
return next is((select jsonb_array_length(missed) from bans where user_id = u), 2, 'ban lists the 2 missed bookings');
return next is((select no_show_streak from profiles where id = u), 0, 'streak reset after ban');
return next is((select status || '/' || cancelled_reason from bookings where id = occ), 'cancelled/ban', 'future series booking cancelled');
return next is((select status from bookings where id = bp), 'checked_in', 'booking already in progress is kept');
return next is(tests.try(u, format('select create_booking(%L, %L, %L, %L)', 'KT6-2', tests.slot(36, '10:00'), tests.slot(36, '11:00'), 'X')),
               'BANNED', 'banned user cannot book');

return next is(tests.try(o, format('select admin_lift_ban(%L)', u)), 'NOT_ADMIN', 'only admins lift bans');
perform tests.try(m, format('select admin_lift_ban(%L)', u));
return next is((select coalesce(p.banned_until::text, 'none') || '/' || (b.lifted_by = m) from profiles p join bans b on b.user_id = p.id where p.id = u),
               'none/true', 'admin lifted the ban');
return next is((select count(*) from cron.job where jobname = 'process-no-shows'), 1::bigint, 'no-show job runs every 5 minutes');

return query select * from finish();

end $TEST$;
create or replace function tests.t_07_handover() returns setof text language plpgsql as $TEST$
declare
  u uuid; r uuid; x uuid; bb uuid; s1 uuid; sr jsonb; occ uuid; d date;
begin
execute $f$create or replace function tests.ci(p_user uuid, p_id uuid, p_now timestamptz) returns text language plpgsql as $g$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform public._check_in_at(p_id, p_now);
  perform set_config('request.jwt.claims', '', true);
  return 'ok';
exception when others then
  perform set_config('request.jwt.claims', '', true);
  return sqlerrm;
end $g$$f$;

u := tests.make_user('u7@sahamitproduct.com', 'U7');
r := tests.make_user('r7@sahamitproduct.com', 'R7');
x := tests.make_user('x7@sahamitproduct.com', 'X7');
bb := tests.make_user('bb7@sahamitproduct.com', 'BB7');
update profiles set banned_until = now() + interval '2 hours' where id = bb;
s1 := tests.val(u, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-1', tests.slot(35, '10:00'), tests.slot(35, '11:00'), 'Trip'))::uuid;
d := (tests.slot(35, '10:00') at time zone 'Asia/Bangkok')::date;
sr := tests.val(u, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'KT6-1', 'Weekly', d, '14:00', '15:00',
                json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int], 'until', d + 21)))::jsonb;
occ := (sr -> 'created' ->> 0)::uuid;
return next plan(9);

return next is(tests.val(u, format('select hand_over(%L, false, %L)', s1, 'R7@SahamitProduct.com')), '1', 'single booking handed over');
return next is((select owner_id from bookings where id = s1), r, 'recipient is the new owner');
return next is(tests.ci(u, s1, tests.slot(35, '10:00')), 'NOT_OWNER', 'previous owner can no longer check in');
return next is(tests.ci(r, s1, tests.slot(35, '10:00')), 'ok', 'new owner checks in');

return next is(tests.val(u, format('select hand_over(%L, true, %L)', occ, 'r7@sahamitproduct.com')), jsonb_array_length(sr -> 'created')::text,
               'whole series (every created date) handed over');
return next is((select owner_id from booking_series where id = (sr ->> 'series_id')::uuid), r, 'series owner changed; logged');

return next is(tests.try(r, format('select hand_over(%L, false, %L)', occ, 'nobody@sahamitproduct.com')), 'RECIPIENT_NOT_FOUND', 'unknown recipient');
return next is(tests.try(r, format('select hand_over(%L, false, %L)', occ, 'bb7@sahamitproduct.com')), 'RECIPIENT_BANNED', 'banned recipient refused');
return next is(tests.try(x, format('select hand_over(%L, false, %L)', occ, 'x7@sahamitproduct.com')), 'NOT_OWNER', 'only owner or admin hands over');

return query select * from finish();

end $TEST$;
create or replace function tests.t_08_seed() returns setof text language plpgsql as $TEST$
begin
return next plan(5);
return next is((select count(*) from holidays where day between '2026-11-16' and '2027-12-31'), 15::bigint, '15 holidays from today to end of 2027');
return next ok(exists (select 1 from holidays where day = '2027-04-13' and name_th = 'วันสงกรานต์'), 'Songkran 2027 present');
return next is((select count(*) from profiles where email like 'mock.%@sahamitproduct.com'), 6::bigint, '6 mock users');
return next ok((select count(*) from bookings b join profiles p on p.id = b.owner_id where p.email like 'mock.%') >= 40, 'at least 40 mock bookings');
return next is((select count(distinct room_code) from bookings), 9::bigint, 'every room has bookings');
return query select * from finish();

end $TEST$;
create or replace function tests.t_08b_demo() returns setof text language plpgsql as $TEST$
declare u uuid; b uuid; t0 timestamptz;
begin
u := tests.make_user('mock.zz@sahamitproduct.com', 'Mock ZZ');
update profiles set is_demo = true where id = u;
t0 := tests.slot(35, '09:00');
insert into bookings (room_code, owner_id, title, starts_at, ends_at) values ('KT6-2', u, 'Demo', t0, t0 + interval '1 hour') returning id into b;
insert into bookings (room_code, owner_id, title, starts_at, ends_at) values ('KT6-2', u, 'Demo 2', t0 + interval '1 hour', t0 + interval '2 hours');
return next plan(2);
perform process_no_shows(t0 + interval '3 hours');
return next is((select status from bookings where id = b), 'checked_in', 'demo bookings count as used');
return next is((select coalesce(banned_until::text, 'none') from profiles where id = u), 'none', 'demo users are never banned');
return query select * from finish();

end $TEST$;
create or replace function tests.t_09_hardening() returns setof text language plpgsql as $TEST$
begin
return next plan(3);
return next ok(not has_function_privilege('anon', 'public.is_admin(uuid)', 'execute'), 'signed-out visitors cannot ask who is admin');
return next ok(has_function_privilege('authenticated', 'public.is_admin(uuid)', 'execute'), 'signed-in users still can (needed by access rules)');
return next is((select count(*) from pg_proc p
                where p.pronamespace in ('public'::regnamespace, 'tests'::regnamespace)
                  and p.proconfig is null and p.prokind = 'f' and p.proname not like 't\_%' and p.proname not in ('suite', 'ci')
                  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
               0::bigint, 'every function pins its search_path');
return query select * from finish();

end $TEST$;
-- Runs every installed tests.t_*() function, each in its own rolled-back sub-transaction.
-- Usage: begin; select * from tests.suite(); rollback;
create or replace function tests.suite() returns table (test text, passed int, failed int, failures text)
language plpgsql as $$
declare fn text; lines text[];
begin
  for fn in select proname from pg_proc where pronamespace = 'tests'::regnamespace and proname like 't\_%' order by 1 loop
    begin
      execute format('select array_agg(x) from tests.%I() x', fn) into lines;
      raise exception 'ROLLBACK_TEST';
    exception when others then
      if sqlerrm <> 'ROLLBACK_TEST' then lines := array['not ok - died: ' || sqlerrm]; end if;
    end;
    test := fn;
    passed := (select count(*) from unnest(lines) l where l like 'ok %');
    failed := (select count(*) from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    failures := (select string_agg(l, E'\n') from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    return next;
  end loop;
end $$;

