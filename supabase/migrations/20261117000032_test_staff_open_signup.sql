create or replace function tests.t_17_staff() returns setof text language plpgsql as $TEST$
declare ad uuid; u uuid; nw uuid; bid uuid; abid uuid; s timestamptz;
begin
ad := tests.make_user('ad17@sahamitproduct.com', 'Ad17', true);
u := tests.make_user('u17@sahamitproduct.com', 'U17');
s := tests.slot(30, '10:00');
return next plan(20);

-- Only admins manage the list; values are checked.
return next is(tests.try(u, $q$select admin_save_staff('[{"email":"x17@sahamitproduct.com","display_name":"X","department":"MKT","role":"user","active":true}]')$q$),
  'NOT_ADMIN', 'only admins can save the staff list');
return next is(tests.try(ad, $q$select admin_save_staff('[{"email":"x17@sahamitproduct.com","display_name":"X","department":"Marketing","role":"user","active":true}]')$q$),
  'BAD_DEPARTMENT', 'departments come from the fixed list');
return next is(tests.try(ad, $q$select admin_save_staff('[{"email":"x17@gmail.com","display_name":"X","department":"MKT","role":"user","active":true}]')$q$),
  'NOT_SHM_EMAIL', 'only company emails go on the list');

-- Someone added before they sign up.
return next is(tests.try(ad, $q$select admin_save_staff('[{"email":"New17@SahamitProduct.com","display_name":"New Seventeen","department":"MKT","role":"user","active":true}]')$q$),
  'ok', 'an admin adds someone who has not signed up yet');
return next is(tests.val(ad, $q$select has_account::text from admin_staff_list() where email = 'new17@sahamitproduct.com'$q$),
  'false', 'the list shows they have no account yet (email stored in lower case)');

-- Sign-up is open to any company email; the list only fills in details and blocks disabled people.
return next is(tests.val(null, $q$select can_sign_up('outsider17@sahamitproduct.com')$q$), 'new', 'can_sign_up: not on the list yet is fine (new)');
return next is(tests.val(null, $q$select can_sign_up('NEW17@sahamitproduct.com ')$q$), 'listed', 'can_sign_up: on the list (any case, spaces trimmed)');
return next is(tests.try(null, $q$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider17@sahamitproduct.com',
          '{"display_name":"Outsider","department":"law"}', now(), now())$q$),
  'ok', 'someone not on the list can still create an account');
return next ok((select display_name = 'Outsider' and department = 'LAW' and role = 'user' and active from staff where email = 'outsider17@sahamitproduct.com'),
  'and they are added to the staff list with the name and department they gave');
nw := gen_random_uuid();
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (nw, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new17@sahamitproduct.com',
        '{"display_name":"Typed name","department":"QA"}', now(), now());
return next ok((select display_name = 'New Seventeen' and department = 'MKT' and role = 'user' from profiles where id = nw),
  'a new account takes its name, department and role from the list');

-- Promote, and the self guard.
return next is(tests.try(ad, $q$select admin_save_staff('[{"email":"u17@sahamitproduct.com","display_name":"U17","department":"SCM","role":"admin","active":true}]')$q$),
  'ok', 'an admin promotes someone');
return next ok((select role = 'admin' and department = 'SCM' from profiles where id = u), 'the change reaches their account');
return next is(tests.try(ad, $q$select admin_save_staff('[{"email":"ad17@sahamitproduct.com","display_name":"Ad17","department":"BD","role":"user","active":true}]')$q$),
  'CANNOT_CHANGE_SELF', 'an admin cannot demote or disable themselves');

-- Disable: future bookings cancelled, sign-in blocked, no booking, no admin powers, can't receive a handover.
bid := tests.val(u, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-1', s, s + interval '1 hour', 'U meeting'))::uuid;
abid := tests.val(ad, format('select (create_booking(%L, %L, %L, %L)).id', 'KT5-2', s, s + interval '1 hour', 'Ad meeting'))::uuid;
perform tests.val(ad, $q$select admin_save_staff('[{"email":"u17@sahamitproduct.com","display_name":"U17","department":"SCM","role":"admin","active":false}]')::text$q$);
return next ok((select status = 'cancelled' and cancelled_reason = 'account_disabled' from bookings where id = bid),
  'disabling cancels their upcoming bookings');
return next ok((select not active from profiles where id = u) and (select banned_until > now() + interval '100 years' from auth.users where id = u),
  'a disabled account is marked inactive and cannot sign in');
return next is(tests.try(u, format('select create_booking(%L, %L, %L, %L)', 'KT5-3', s, s + interval '1 hour', 'Again')),
  'ACCOUNT_DISABLED', 'a disabled account cannot book');
return next ok(not is_admin(u), 'a disabled admin has no admin powers');
return next is(tests.try(ad, format('select hand_over(%L, false, %L)', abid, 'u17@sahamitproduct.com')),
  'RECIPIENT_NOT_FOUND', 'bookings cannot be handed to a disabled account');
return next is(tests.val(null, $q$select can_sign_up('u17@sahamitproduct.com')$q$), 'ACCOUNT_DISABLED', 'can_sign_up explains a disabled account');

-- Enable again.
perform tests.val(ad, $q$select admin_save_staff('[{"email":"u17@sahamitproduct.com","display_name":"U17","department":"SCM","role":"user","active":true}]')::text$q$);
return next ok((select active from profiles where id = u) and (select banned_until is null from auth.users where id = u),
  're-enabling lets them sign in again');
return query select * from finish();
end $TEST$;
revoke execute on function tests.t_17_staff() from public, anon;
