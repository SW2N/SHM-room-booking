declare
  a uuid; c uuid; u uuid; v uuid; o uuid; b1 uuid; b2 uuid; p uuid; t timestamptz; d date; r jsonb;
  ins text := $q$insert into bookings (room_code, owner_id, title, starts_at, ends_at) values (%L, %L, 'T', %L, %L) returning id$q$;
begin
a := tests.make_user('a11@sahamitproduct.com', 'A11');
c := tests.make_user('c11@sahamitproduct.com', 'C11');
u := tests.make_user('u11@sahamitproduct.com', 'U11');
o := tests.make_user('o11@sahamitproduct.com', 'O11');
return next plan(11);

-- (b) a booking handed to someone who hasn't seen it doesn't count against them
t := tests.slot(35, '09:00');
execute format(ins, 'AC2-1', a, t, t + interval '1 hour') into b1;
execute format(ins, 'AC2-2', a, t + interval '2 hours', t + interval '3 hours') into b2;
perform tests.val(a, format('select hand_over(%L, false, %L)', b1, 'c11@sahamitproduct.com'));
perform process_no_shows(t + interval '15 minutes');
return next is((select status || '/' || (select no_show_streak from profiles where id = c) from bookings where id = b1), 'no_show/0', 'unseen handed-over booking: released, not counted');
perform tests.val(a, format('select hand_over(%L, false, %L)', b2, 'c11@sahamitproduct.com'));
perform tests.val(c, 'select acknowledge_handovers()');
perform process_no_shows(t + interval '2 hours 15 minutes');
return next is((select no_show_streak from profiles where id = c), 1, 'once seen, a missed handed-over booking counts');

-- edit a booking after it has started (title / end), not its start or room
perform set_config('app.bypass_rules', 'on', true);
execute format(ins, 'KT6-2', u, tests.slot(-7, '10:00'), tests.slot(-7, '11:00')) into p;
perform set_config('app.bypass_rules', 'off', true);
return next is(tests.try(u, format('select update_booking(%L, %L, %L, %L, %L)', p, 'KT6-2', tests.slot(-7, '10:00'), tests.slot(-7, '11:00'), 'Fixed title')), 'ok', 'title of a started booking can be fixed');
return next is(tests.try(u, format('select update_booking(%L, %L, %L, %L, %L)', p, 'KT6-2', tests.slot(-7, '10:00'), tests.slot(-7, '11:30'), 'Fixed title')), 'ok', 'end of a started booking can be extended');
update bookings set status = 'checked_in' where id = p;
return next is(tests.try(u, format('select update_booking(%L, %L, %L, %L, %L)', p, 'KT6-2', tests.slot(-7, '10:00'), tests.slot(-7, '11:30'), 'Again')), 'ok', 'checked-in booking: title can change');
return next is(tests.try(u, format('select update_booking(%L, %L, %L, %L, %L)', p, 'KT6-1', tests.slot(-7, '10:00'), tests.slot(-7, '11:30'), 'Again')), 'NOT_ACTIVE', 'checked-in booking cannot move room');

-- no extra count while banned: three misses at the same time → banned, count back to 0
t := tests.slot(36, '09:00');
execute format(ins, 'KT5-1', u, t, t + interval '1 hour');
execute format(ins, 'KT5-2', u, t, t + interval '1 hour');
execute format(ins, 'KT5-3', u, t, t + interval '1 hour');
perform process_no_shows(t + interval '15 minutes');
return next is((select no_show_streak || '/' || (banned_until is not null) from profiles where id = u), '0/true', 'triple miss: banned once, count restarts at 0');

-- ban status is private
return next ok(tests.try(o, 'select banned_until from profiles limit 1') like 'permission denied%', 'colleagues cannot read ban status');
return next is(tests.val(u, 'select (my_profile()).banned_until is not null')::boolean, true, 'people can see their own ban');

-- repeat-rule inputs
d := (tests.slot(40, '10:00') at time zone 'Asia/Bangkok')::date;
r := tests.val(a, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'AC6-1', 'Dup', d, '15:00', '16:00',
               json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int, extract(isodow from d)::int], 'until', d + 7)))::jsonb;
return next ok(not exists (select 1 from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'ROOM_TAKEN'), 'repeated weekday in the rule is counted once (no clash with itself)');
return next is(tests.try(a, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)', 'AC6-1', 'Bad', d, '15:00', '16:00',
               '{"freq":"weekly","interval":"x","weekdays":[1],"until":"2027-12-31"}')), 'BAD_RULE', 'non-number interval gives BAD_RULE');

return query select * from finish();
