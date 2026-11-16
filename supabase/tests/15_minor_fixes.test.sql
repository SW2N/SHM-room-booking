declare a uuid; b uuid; bid uuid; s timestamptz; e timestamptz; d date; sr jsonb;
begin
a := tests.make_user('a15@sahamitproduct.com', 'A15');
b := tests.make_user('b15@sahamitproduct.com', 'B15');
s := tests.slot(35, '10:00'); e := tests.slot(35, '11:00');
d := (s at time zone 'Asia/Bangkok')::date;
return next plan(5);

bid := tests.val(a, format('select (create_booking(%L, %L, %L, %L)).id', 'KT6-2', s, e, 'Mine'))::uuid;
perform tests.val(b, format('select (place_hold(%L, %L, %L)).id', 'KT6-2', e, e + interval '1 hour'));
return next is(tests.try(a, format('select update_booking(%L, %L, %L, %L, %L)', bid, 'KT6-2', s, e + interval '1 hour', 'Mine')), 'ROOM_HELD', 'extending the end time respects other people''s holds');

sr := tests.val(a, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'AC2-2', 'S', d, '13:00', '14:00',
                json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int], 'until', d + 7)))::jsonb;
return next is((select series_owner_id from booking_details where id = (sr -> 'created' ->> 0)::uuid), a, 'booking_details shows the series owner');

perform tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-1', s, e));
perform tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-2', s, e));
return next is((select count(*) from holds where user_id = a and expires_at > now()), 2::bigint, 'a second tab keeps its own hold');
perform tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-3', s, e));
perform tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'AC6-1', s, e));
return next is((select count(*) from holds where user_id = a and expires_at > now()), 3::bigint, 'at most 3 holds per person');
return next is(tests.try(a, format('select place_hold(%L, %L, %L)', 'AC6-1', s, e)), 'ok', 'my own hold never blocks me');

return query select * from finish();
