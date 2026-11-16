-- Test helpers (schema `tests`, not exposed through the API). Installed by migration 20261116000002_test_helpers.sql.
create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.make_user(p_email text, p_name text default 'Test', p_admin boolean default false)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('display_name', p_name, 'department', 'QA'), now(), now());
  if p_admin then update public.profiles set role = 'admin' where id = v_id; end if;
  return v_id;
end $$;

create or replace function tests.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.act_as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- First Mon–Fri non-holiday date at least p_days_ahead days after today (Bangkok), at p_hhmm Bangkok time.
create or replace function tests.slot(p_days_ahead int, p_hhmm text) returns timestamptz
language plpgsql stable as $$
declare d date := (now() at time zone 'Asia/Bangkok')::date + p_days_ahead;
begin
  while extract(isodow from d) in (6, 7) or exists (select 1 from public.holidays h where h.day = d) loop
    d := d + 1;
  end loop;
  return (d + p_hhmm::time) at time zone 'Asia/Bangkok';
end $$;
grant execute on all functions in schema tests to authenticated;
revoke execute on all functions in schema tests from public, anon;

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
