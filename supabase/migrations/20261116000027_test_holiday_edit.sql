create or replace function tests.t_16_holiday_edit() returns setof text language plpgsql as $TEST$
declare ad uuid; u uuid; d date := '2099-03-03';
begin
ad := tests.make_user('ad16@sahamitproduct.com', 'Ad16', true);
u := tests.make_user('u16@sahamitproduct.com', 'U16');
insert into holidays (day, name_th) values (d, 'เดิม');
return next plan(3);
return next is(tests.try(ad, format('update holidays set name_th = %L, name_en = %L, day = %L where day = %L', 'ใหม่', 'New', d + 1, d)), 'ok', 'admin edit runs');
return next ok(exists (select 1 from holidays where day = d + 1 and name_th = 'ใหม่' and name_en = 'New') and not exists (select 1 from holidays where day = d),
               'an admin can change a holiday''s date and names');
perform tests.try(u, format('update holidays set name_th = %L where day = %L', 'แฮก', d + 1));
return next is((select name_th from holidays where day = d + 1), 'ใหม่', 'someone who is not an admin cannot change a holiday');
return query select * from finish();
end $TEST$;
revoke execute on function tests.t_16_holiday_edit() from public, anon;
