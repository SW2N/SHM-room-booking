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
