declare
  u uuid; r uuid; x uuid; bb uuid; s1 uuid; sr jsonb; occ uuid; d date;
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

u := tests.make_user('u7@sahamitproduct.com', 'U7');
r := tests.make_user('r7@sahamitproduct.com', 'R7');
x := tests.make_user('x7@sahamitproduct.com', 'X7');
bb := tests.make_user('bb7@sahamitproduct.com', 'BB7');
update profiles set banned_until = now() + interval '2 hours' where id = bb;
s1 := tests.val(u, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-1', tests.slot(35, '10:00'), tests.slot(35, '11:00'), 'Trip'))::uuid;
d := (tests.slot(35, '10:00') at time zone 'Asia/Bangkok')::date;
sr := tests.val(u, format('select create_series(%L, %L, %L::date, %L::time, %L::time, %L::jsonb)::text', 'KT6-1', 'Weekly', d, '14:00', '15:00',
                json_build_object('freq', 'weekly', 'weekdays', array[extract(isodow from d)::int], 'until', d + 21)))::jsonb;
occ := (sr -> 'created' ->> 0)::uuid;
return next plan(9);

return next is(tests.val(u, format('select hand_over(%L, false, %L)', s1, 'R7@SahamitProduct.com')), '1', 'single booking handed over');
return next is((select owner_id from bookings where id = s1), r, 'recipient is the new owner');
return next is(tests.ci(u, s1, tests.slot(35, '10:00')), 'NOT_OWNER', 'previous owner can no longer check in');
return next is(tests.ci(r, s1, tests.slot(35, '10:00')), 'ok', 'new owner checks in');

return next is(tests.val(u, format('select hand_over(%L, true, %L)', occ, 'r7@sahamitproduct.com')), jsonb_array_length(sr -> 'created')::text,
               'whole series (every created date) handed over');
return next is((select owner_id from booking_series where id = (sr ->> 'series_id')::uuid), r, 'series owner changed; logged');

return next is(tests.try(r, format('select hand_over(%L, false, %L)', occ, 'nobody@sahamitproduct.com')), 'RECIPIENT_NOT_FOUND', 'unknown recipient');
return next is(tests.try(r, format('select hand_over(%L, false, %L)', occ, 'bb7@sahamitproduct.com')), 'RECIPIENT_BANNED', 'banned recipient refused');
return next is(tests.try(x, format('select hand_over(%L, false, %L)', occ, 'x7@sahamitproduct.com')), 'NOT_OWNER', 'only owner or admin hands over');

return query select * from finish();
