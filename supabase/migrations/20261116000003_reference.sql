-- Rooms, holidays, profiles, SHM-only sign-up, user settings.

create or replace function public.raise_err(p_code text) returns void
language plpgsql as $$ begin raise exception using message = p_code; end $$;

create table public.rooms (
  code text primary key,
  building text not null check (building in ('Academy', 'Korn Thong')),
  name_en text not null,
  name_th text not null,
  floor int not null,
  seats_min int not null,
  seats_max int not null,
  size_class text not null check (size_class in ('S', 'M', 'L', 'XL')),
  sort int not null
);

insert into public.rooms (code, building, name_en, name_th, floor, seats_min, seats_max, size_class, sort) values
  ('AC2-1', 'Academy',    'Gracie',       'เกรซี่',      2, 10, 15, 'XL', 1),
  ('AC2-2', 'Academy',    'Hanasol',      'ฮานาโซล',    2,  4,  6, 'S',  2),
  ('AC6-1', 'Academy',    'Hibaby',       'ไฮเบบี้',     6,  6,  8, 'M',  3),
  ('AC6-2', 'Academy',    'Canteen',      'แคนทีน',     6,  8, 10, 'L',  4),
  ('KT5-1', 'Korn Thong', 'Soft-D',       'ซอฟท์ดี',     5,  6,  8, 'M',  5),
  ('KT5-2', 'Korn Thong', 'Wow',          'ว้าว',        5,  4,  6, 'S',  6),
  ('KT5-3', 'Korn Thong', 'Champ',        'แชมป์',       5, 10, 15, 'XL', 7),
  ('KT6-1', 'Korn Thong', 'Krua Mae Lek', 'ครัวแม่เล็ก',  6,  6,  8, 'M',  8),
  ('KT6-2', 'Korn Thong', 'Yok Niw',      'ยกนิ้ว',      6,  4,  6, 'S',  9);

create table public.holidays (
  day date primary key,
  name_th text not null,
  name_en text
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text not null,
  department text,
  role text not null default 'user' check (role in ('user', 'admin')),
  lang text not null default 'th' check (lang in ('th', 'en')),
  year_style text not null default 'BE' check (year_style in ('BE', 'CE')),
  date_format text not null default 'long' check (date_format in ('long', 'numeric')),
  no_show_streak int not null default 0,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'admin');
$$;

-- Sign-up: only @sahamitproduct.com
create or replace function public.enforce_shm_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@sahamitproduct.com' then
    perform raise_err('NOT_SHM_EMAIL');
  end if;
  return new;
end $$;

create trigger enforce_shm_email before insert or update of email on auth.users
  for each row execute function public.enforce_shm_email();

create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name, department)
  values (new.id, lower(new.email),
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
          nullif(trim(new.raw_user_meta_data ->> 'department'), ''));
  return new;
end $$;

create trigger create_profile after insert on auth.users
  for each row execute function public.create_profile();

create or replace function public.update_my_settings(p_lang text, p_year_style text, p_date_format text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v profiles;
begin
  update profiles set
    lang = coalesce(p_lang, lang),
    year_style = coalesce(p_year_style, year_style),
    date_format = coalesce(p_date_format, date_format)
  where id = auth.uid()
  returning * into v;
  if v.id is null then perform raise_err('NOT_FOUND'); end if;
  return v;
end $$;

-- Access: read for signed-in users; holidays editable by admins; profiles only via RPCs.
alter table public.rooms enable row level security;
alter table public.holidays enable row level security;
alter table public.profiles enable row level security;

create policy rooms_read on public.rooms for select to authenticated using (true);
create policy holidays_read on public.holidays for select to authenticated using (true);
create policy holidays_admin_insert on public.holidays for insert to authenticated with check (public.is_admin());
create policy holidays_admin_delete on public.holidays for delete to authenticated using (public.is_admin());
create policy profiles_read on public.profiles for select to authenticated using (true);

revoke execute on function public.update_my_settings(text, text, text) from public, anon;
grant execute on function public.update_my_settings(text, text, text) to authenticated;
revoke execute on function public.enforce_shm_email() from public, anon, authenticated;
revoke execute on function public.create_profile() from public, anon, authenticated;
