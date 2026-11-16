-- Run p_sql as p_user (null = postgres). Returns 'ok' or the error message (the rule's error code).
create or replace function tests.try(p_user uuid, p_sql text) returns text language plpgsql as $$
begin
  if p_user is not null then perform tests.act_as(p_user); end if;
  execute p_sql;
  perform tests.act_as_postgres();
  return 'ok';
exception when others then
  perform tests.act_as_postgres();
  return sqlerrm;
end $$;

-- Run a single-value query as p_user (null = postgres) and return the value as text.
create or replace function tests.val(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  if p_user is not null then perform tests.act_as(p_user); end if;
  execute p_sql into v;
  perform tests.act_as_postgres();
  return v;
end $$;
grant execute on function tests.try(uuid, text), tests.val(uuid, text) to authenticated;
revoke execute on function tests.try(uuid, text), tests.val(uuid, text) from public, anon;
