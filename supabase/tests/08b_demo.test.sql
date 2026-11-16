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
