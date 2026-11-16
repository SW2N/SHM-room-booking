return next plan(5);
return next is((select count(*) from holidays where day between '2026-11-16' and '2027-12-31'), 15::bigint, '15 holidays from today to end of 2027');
return next ok(exists (select 1 from holidays where day = '2027-04-13' and name_th = 'วันสงกรานต์'), 'Songkran 2027 present');
return next is((select count(*) from profiles where email like 'mock.%@sahamitproduct.com'), 6::bigint, '6 mock users');
return next ok((select count(*) from bookings b join profiles p on p.id = b.owner_id where p.email like 'mock.%') >= 40, 'at least 40 mock bookings');
return next is((select count(distinct room_code) from bookings), 9::bigint, 'every room has bookings');
return query select * from finish();
