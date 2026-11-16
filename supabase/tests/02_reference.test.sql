return next plan(9);

return next is((select count(*) from rooms), 9::bigint, '9 rooms');
return next is((select size_class from rooms where code = 'KT5-3'), 'XL', 'Champ is XL');
return next is((select size_class from rooms where code = 'AC6-2'), 'L', 'Canteen is L');

return next throws_ok(
  $$ insert into auth.users (id, aud, role, email) values (gen_random_uuid(), 'authenticated', 'authenticated', 'x@gmail.com') $$,
  'NOT_SHM_EMAIL', 'non-SHM email is rejected');

return next lives_ok($$ select tests.make_user('Somchai@SahamitProduct.com', 'Somchai') $$, 'SHM email (any case) is accepted');
return next is((select display_name from profiles where email ilike 'somchai@%'), 'Somchai', 'profile created from sign-up data');

perform tests.act_as((select id from profiles where email ilike 'somchai@%'));
perform update_my_settings('en', 'CE', null);
perform tests.act_as_postgres();
return next is((select lang || '/' || year_style || '/' || date_format from profiles where email ilike 'somchai@%'),
               'en/CE/long', 'settings saved; null leaves date_format unchanged');

perform tests.act_as((select id from profiles where email ilike 'somchai@%'));
update profiles set role = 'admin';
return next is((select count(*) from rooms), 9::bigint, 'signed-in users can read rooms');
perform tests.act_as_postgres();
return next is((select role from profiles where email ilike 'somchai@%'), 'user', 'user cannot make themselves admin');

return query select * from finish();
