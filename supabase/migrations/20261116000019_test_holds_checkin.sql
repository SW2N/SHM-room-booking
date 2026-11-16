-- Installs supabase/tests/12_holds_checkin.test.sql and the updated 06_checkin_bans.test.sql into the test suite.
create or replace function tests.t_12_holds_checkin() returns setof text language plpgsql as $TEST$
declare
  a uuid; b uuid; u uuid; b1 uuid; b2 uuid; h uuid; s timestamptz; e timestamptz; day0 timestamptz;
  ins text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L) returning id$q$;
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
a := tests.make_user('a12@sahamitproduct.com', 'A12');
b := tests.make_user('b12@sahamitproduct.com', 'B12');
u := tests.make_user('u12@sahamitproduct.com', 'U12');
s := tests.slot(35, '10:00'); e := tests.slot(35, '11:00');
day0 := ((s at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok';
execute format(ins, 'AC6-2', u, s, e) into b1;
execute format(ins, 'AC6-1', u, s, e) into b2;
return next plan(11);

return next is(tests.ci(u, b1, day0 - interval '1 minute'), 'CHECKIN_WINDOW', 'day before: too early');
return next is(tests.ci(u, b1, day0), 'ok', 'from midnight on the day: ok');
return next is(tests.ci(u, b2, s + interval '16 minutes'), 'CHECKIN_WINDOW', 'more than 15 min after start: too late');

h := tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-1', s, e))::uuid;
return next ok(h is not null, 'hold placed');
return next is(tests.try(b, format('select create_booking(%L, %L, %L, %L)', 'KT5-1', s, e, 'X')), 'ROOM_HELD', 'others cannot book a held slot');
return next is(tests.try(b, format('select place_hold(%L, %L, %L)', 'KT5-1', s + interval '30 minutes', e + interval '30 minutes')), 'ROOM_HELD', 'others cannot hold an overlapping slot');
return next is(tests.try(b, format('select release_hold(%L)', h)), 'NOT_OWNER', 'others cannot release my hold');
return next is(tests.try(a, format('select create_booking(%L, %L, %L, %L)', 'KT5-1', s, e, 'Mine')), 'ok', 'holder books their own held slot');
return next is((select count(*) from holds where user_id = a), 0::bigint, 'hold removed once booked');

h := tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-2', s, e))::uuid;
update holds set expires_at = now() - interval '1 second' where id = h;
return next is(tests.try(b, format('select create_booking(%L, %L, %L, %L)', 'KT5-2', s, e, 'X')), 'ok', 'expired hold no longer blocks');

return next is((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('bookings', 'holds')), 2::bigint, 'live updates on bookings and holds');

return query select * from finish();

end $TEST$;
revoke execute on function tests.t_12_holds_checkin() from public, anon;
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

return next is(tests.ci(u, b1, t0 - interval '1 minute'), 'CHECKIN_WINDOW', 'too early (day before)');
return next is(tests.ci(u, b1, t0), 'ok', 'from midnight on the day is fine');
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
revoke execute on function tests.t_06_checkin_bans() from public, anon;
