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
