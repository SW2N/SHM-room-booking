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
