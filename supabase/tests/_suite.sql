-- Runs every installed tests.t_*() function, each in its own rolled-back sub-transaction.
-- Usage: begin; select * from tests.suite(); rollback;
create or replace function tests.suite() returns table (test text, passed int, failed int, failures text)
language plpgsql as $$
declare fn text; lines text[];
begin
  for fn in select proname from pg_proc where pronamespace = 'tests'::regnamespace and proname like 't\_%' order by 1 loop
    begin
      execute format('select array_agg(x) from tests.%I() x', fn) into lines;
      raise exception 'ROLLBACK_TEST';
    exception when others then
      if sqlerrm <> 'ROLLBACK_TEST' then lines := array['not ok - died: ' || sqlerrm]; end if;
    end;
    test := fn;
    passed := (select count(*) from unnest(lines) l where l like 'ok %');
    failed := (select count(*) from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    failures := (select string_agg(l, E'\n') from unnest(lines) l where l like 'not ok%' or l like '# Looks like%');
    return next;
  end loop;
end $$;
