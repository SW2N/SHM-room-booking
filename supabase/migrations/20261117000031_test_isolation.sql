-- Tests run against the live project, so they must not depend on (or collide with) real bookings.
-- The runner clears booking data before each test inside the test's own sandbox, which is always rolled back.
create or replace function tests.isolate() returns void language plpgsql set search_path = public as $$
begin
  -- Guard: only ever inside tests.suite(), whose work is always rolled back.
  if current_setting('tests.running', true) is distinct from 'on' then
    raise exception 'tests.isolate() only runs inside tests.suite()';
  end if;
  delete from handovers;
  delete from holds;
  delete from bookings;
  delete from booking_series;
  delete from bans;
  update profiles set no_show_streak = 0, banned_until = null where no_show_streak <> 0 or banned_until is not null;
end $$;
revoke all on function tests.isolate() from public, anon, authenticated;

create or replace function tests.suite()
returns table(test text, passed integer, failed integer, failures text) language plpgsql as $$
declare fn text; lines text[];
begin
  for fn in select proname from pg_proc where pronamespace = 'tests'::regnamespace and proname like 't\_%' order by 1 loop
    begin
      perform set_config('tests.running', 'on', true);
      perform tests.isolate();
      execute format('select array_agg(x) from tests.%I() x', fn) into lines;
      raise exception 'ROLLBACK_TEST';
    exception when others then
      if sqlerrm <> 'ROLLBACK_TEST' then lines := array['not ok - died: ' || sqlerrm]; end if;
    end;
    perform set_config('tests.running', 'off', true);
    test := fn;
    passed := (select count(*) from unnest(lines) l where l like 'ok %');
    failed := (select count(*) from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    failures := (select string_agg(l, E'\n') from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    return next;
  end loop;
end $$;

-- The demo data was removed on 17 Nov 2026 (the user's request), so its seed test is retired.
drop function if exists tests.t_08_seed();
