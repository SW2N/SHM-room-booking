return next plan(3);
return next ok(not has_function_privilege('anon', 'public.is_admin(uuid)', 'execute'), 'signed-out visitors cannot ask who is admin');
return next ok(has_function_privilege('authenticated', 'public.is_admin(uuid)', 'execute'), 'signed-in users still can (needed by access rules)');
return next is((select count(*) from pg_proc p
                where p.pronamespace in ('public'::regnamespace, 'tests'::regnamespace)
                  and p.proconfig is null and p.prokind = 'f' and p.proname not like 't\_%' and p.proname not in ('suite', 'ci')
                  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
               0::bigint, 'every function pins its search_path');
return query select * from finish();
