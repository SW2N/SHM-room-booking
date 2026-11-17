declare ad uuid; u uuid; tmp text;
begin
ad := tests.make_user('ad18@sahamitproduct.com', 'Ad18', true);
u := tests.make_user('u18@sahamitproduct.com', 'U18');
return next plan(6);

return next is(tests.try(u, $q$select admin_reset_password('ad18@sahamitproduct.com')$q$), 'NOT_ADMIN', 'only admins can reset a password');
return next is(tests.try(ad, $q$select admin_reset_password('nobody18@sahamitproduct.com')$q$), 'NOT_FOUND', 'an email without an account is reported');

tmp := tests.val(ad, $q$select admin_reset_password(' U18@sahamitproduct.com ')$q$);
return next ok(length(tmp) >= 8, 'the admin gets a temporary password of at least 8 characters');
return next ok((select encrypted_password = extensions.crypt(tmp, encrypted_password) from auth.users where id = u),
  'the temporary password is what now signs them in');
return next ok((select must_change_password from profiles where id = u), 'they must choose their own password at next sign-in');

perform tests.val(u, $q$select password_changed()::text$q$);
return next ok(not (select must_change_password from profiles where id = u), 'after setting their own password the reminder is cleared');
return query select * from finish();
