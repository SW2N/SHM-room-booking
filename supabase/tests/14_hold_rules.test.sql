declare a uuid; b uuid; c uuid; h uuid; s timestamptz; e timestamptz; d date; b1 uuid; b2 uuid; sat date;
  ins text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L) returning id$q$;
begin
a := tests.make_user('a14@sahamitproduct.com', 'A14');
b := tests.make_user('b14@sahamitproduct.com', 'B14');
c := tests.make_user('c14@sahamitproduct.com', 'C14');
s := tests.slot(35, '10:00'); e := tests.slot(35, '11:00');
sat := (now() at time zone 'Asia/Bangkok')::date + 35;
while extract(isodow from sat) <> 6 loop sat := sat + 1; end loop;
return next plan(9);

return next is(tests.try(a, format('select place_hold(%L, %L, %L)', 'KT5-3', s, s + interval '55 days')), 'OUTSIDE_HOURS', 'a hold cannot span days');
return next is(tests.try(a, format('select place_hold(%L, %L, %L)', 'KT5-3', (sat + time '10:00') at time zone 'Asia/Bangkok', (sat + time '11:00') at time zone 'Asia/Bangkok')), 'WEEKEND', 'no weekend holds for users');
return next is(tests.try(a, format('select place_hold(%L, %L, %L)', 'KT5-3', tests.slot(-7, '10:00'), tests.slot(-7, '11:00'))), 'IN_PAST', 'no holds in the past');
return next is(tests.try(a, format('select place_hold(%L, %L, %L)', 'KT5-3', s + interval '15 minutes', e)), 'NOT_ALIGNED', 'holds follow 30-minute steps');

h := tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-1', s, e))::uuid;
update holds set expires_at = now() - interval '1 second' where id = h;
perform tests.val(b, format('select (place_hold(%L, %L, %L)).id', 'KT5-1', s, e));
return next is(tests.try(a, format('select renew_hold(%L)', h)), 'NOT_FOUND', 'a lapsed hold taken over by someone else cannot be revived');

h := tests.val(a, format('select (place_hold(%L, %L, %L)).id', 'KT5-2', s, e))::uuid;
update holds set created_at = now() - interval '31 minutes' where id = h;
return next is(tests.try(a, format('select renew_hold(%L)', h)), 'HOLD_EXPIRED', 'a hold cannot be renewed past 30 minutes');

execute format(ins, 'AC6-1', a, s, e) into b1;
execute format(ins, 'AC6-2', a, s, e) into b2;
perform tests.val(a, format('select hand_over(%L, false, %L)', b1, 'c14@sahamitproduct.com'));
perform tests.val(a, format('select hand_over(%L, false, %L)', b2, 'c14@sahamitproduct.com'));
perform tests.val(c, format('select acknowledge_handovers(array[%L]::uuid[])', b1));
return next is((select handover_unseen from bookings where id = b1), false, 'only the shown booking is marked seen');
return next is((select handover_unseen from bookings where id = b2), true, 'others stay unseen');
perform tests.val(c, 'select acknowledge_handovers()');
return next is((select handover_unseen from bookings where id = b2), false, 'no list: all marked seen');

return query select * from finish();
