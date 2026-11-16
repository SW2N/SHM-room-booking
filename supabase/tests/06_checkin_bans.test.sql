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
d := (tests.slot(7, '09:00') at time zone 'Asia/Bangkok')::date;
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
return next is(tests.try(u, format('select create_booking(%L, %L, %L, %L)', 'KT6-2', tests.slot(8, '10:00'), tests.slot(8, '11:00'), 'X')),
               'BANNED', 'banned user cannot book');

return next is(tests.try(o, format('select admin_lift_ban(%L)', u)), 'NOT_ADMIN', 'only admins lift bans');
perform tests.try(m, format('select admin_lift_ban(%L)', u));
return next is((select coalesce(p.banned_until::text, 'none') || '/' || (b.lifted_by = m) from profiles p join bans b on b.user_id = p.id where p.id = u),
               'none/true', 'admin lifted the ban');
return next is((select count(*) from cron.job where jobname = 'process-no-shows'), 1::bigint, 'no-show job runs every 5 minutes');

return query select * from finish();
