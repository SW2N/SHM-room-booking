-- Admins can correct a holiday's date or names (before: add and delete only).
create policy holidays_admin_update on public.holidays for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update on public.holidays to authenticated;
