-- The room list is public (names, floors, sizes) so the sign-in page can show it; nothing else is.
create policy rooms_read_anon on public.rooms for select to anon using (true);
