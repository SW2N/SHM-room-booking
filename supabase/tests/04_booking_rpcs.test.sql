declare
  a uuid; b uuid; m uuid; bid uuid;
  s1 timestamptz; e1 timestamptz;
begin
a := tests.make_user('a4@sahamitproduct.com', 'A4');
b := tests.make_user('b4@sahamitproduct.com', 'B4');
m := tests.make_user('m4@sahamitproduct.com', 'M4', true);
s1 := tests.slot(7, '10:00'); e1 := tests.slot(7, '11:00');
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
