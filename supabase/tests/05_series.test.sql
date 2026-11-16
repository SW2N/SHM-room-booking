declare
  a uuid; b uuid; m uuid; d date; r1 jsonb; r2 jsonb; r jsonb;
  cs text := 'select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text';
begin
a := tests.make_user('a5@sahamitproduct.com', 'A5');
b := tests.make_user('b5@sahamitproduct.com', 'B5');
m := tests.make_user('m5@sahamitproduct.com', 'M5', true);
d := (now() at time zone 'Asia/Bangkok')::date + 35;
while extract(isodow from d) <> 2 loop d := d + 1; end loop;   -- a Tuesday at least a week ahead
return next plan(10);

r1 := tests.val(a, format(cs, 'KT5-3', 'MM Meeting', d, '09:30', '12:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 35)))::jsonb;
return next is(jsonb_array_length(r1 -> 'created'), 6, 'weekly Tuesday x6 creates 6');
return next is(jsonb_array_length(r1 -> 'skipped'), 0, 'nothing skipped');

perform tests.val(b, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-1', (d + 14 + time '10:00') at time zone 'Asia/Bangkok', (d + 14 + time '11:00') at time zone 'Asia/Bangkok', 'Blocker'));
r2 := tests.val(a, format(cs, 'KT5-1', 'NF team', d, '09:30', '12:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 35)))::jsonb;
return next is(jsonb_array_length(r2 -> 'created'), 5, 'clashing week skipped, rest booked');
return next is(r2 -> 'skipped' -> 0 ->> 'reason', 'ROOM_TAKEN', 'skip reason is ROOM_TAKEN');

r := tests.val(a, format(cs, 'KT6-1', 'Long', d, '13:00', '14:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 150)))::jsonb;
return next ok(exists (select 1 from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'TOO_FAR_AHEAD'), 'user: dates past 3 months skipped');
r := tests.val(m, format(cs, 'KT6-2', 'Long', d, '13:00', '14:00', json_build_object('freq','weekly','interval',1,'weekdays',array[2],'until',d + 150)))::jsonb;
return next ok(not exists (select 1 from jsonb_array_elements(r -> 'skipped') x where x ->> 'reason' = 'TOO_FAR_AHEAD'), 'admin: no 3-month limit');

return next is(tests.try(a, format(cs, 'KT6-2', 'Bad', d, '09:00', '10:00', '{"freq":"yearly","until":"2027-12-31"}')), 'BAD_RULE', 'unknown rule rejected');
return next is(tests.try(b, format('select cancel_series(%L)', r1 ->> 'series_id')), 'NOT_OWNER', 'others cannot cancel a series');
return next is(tests.val(a, format('select cancel_series(%L)', r1 ->> 'series_id')), '6', 'owner cancels all 6');
return next is(tests.try(b, format('select create_booking(%L, %L, %L, %L)', 'KT5-3', (d + time '09:30') at time zone 'Asia/Bangkok', (d + time '12:00') at time zone 'Asia/Bangkok', 'Mine')),
               'ok', 'cancelled series frees its slots');

return query select * from finish();
