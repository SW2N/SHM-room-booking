-- Security hardening from the Supabase advisor.
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

alter function public.raise_err(text) set search_path = public;
alter function public._series_dates(date, jsonb) set search_path = public;
alter function tests.make_user(text, text, boolean) set search_path = public;
alter function tests.act_as(uuid) set search_path = public;
alter function tests.act_as_postgres() set search_path = public;
alter function tests.slot(int, text) set search_path = public;
alter function tests.try(uuid, text) set search_path = public, extensions;
alter function tests.val(uuid, text) set search_path = public, extensions;
