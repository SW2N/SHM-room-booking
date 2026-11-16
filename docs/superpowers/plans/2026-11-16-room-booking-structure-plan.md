# SHM Room Booking — Phase 1 (Structure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete back end of the SHM meeting-room booking platform (data, sign-up rules, booking rules, check-in/no-show/ban, handover, admin, holidays, mock data) plus the GitHub repo that auto-publishes the web app — with only a placeholder page; the real screens are Phase 2.

**Architecture:** All rules live in Postgres on Supabase so no client can bypass them: tables are read-only to users through row-level security, and every write goes through `security definer` RPC functions that check ownership and raise named error codes. A trigger validates every booking row; an exclusion constraint makes double-booking physically impossible; a `pg_cron` job marks no-shows and applies bans every 5 minutes. The web app (Phase 2) is a static React/Vite site on GitHub Pages that talks to Supabase with the public key.

**Tech Stack:** Supabase (Postgres 15+, `btree_gist`, `pg_cron`, `pgtap`, Supabase Auth email+password), SQL migrations applied with the Supabase MCP `apply_migration`, pgTAP tests run with Supabase MCP `execute_sql`, GitHub (`gh` CLI, account `SW2N`), GitHub Actions + Pages, React + Vite (placeholder only).

**Spec:** `docs/superpowers/specs/2026-11-16-shm-room-booking-design.md`

## Global Constraints

- Allowed sign-up domain: `@sahamitproduct.com` only (case-insensitive), enforced in the database.
- No email confirmation at sign-up (Auth setting "Confirm email" = off).
- Bookable hours: 08:00–20:00 Asia/Bangkok, start and end on :00 or :30, start and end on the same day.
- Weekends (Sat/Sun) and rows in `holidays` are not bookable — except by admins.
- Users may book up to 3 months ahead (start date ≤ today in Bangkok + 3 months); admins unlimited. No booking may start in the past (admins included).
- Check-in window: from start − 60 min to start + 15 min.
- No-show: still `confirmed` at start + 15 min.
- Ban: 2 no-shows in a row → banned 4 hours, all the person's future active bookings cancelled, streak reset to 0. Any check-in resets the streak to 0. Admin can lift a ban early.
- Handover: owner or admin hands one booking or a whole series to another registered SHM user; no accept step; logged.
- Room code (`AC2-1` …) is a data key only, never shown to users.
- All timestamps stored as `timestamptz`; all rule checks evaluated in `Asia/Bangkok`.
- Error codes (exact `MESSAGE` of raised exceptions, used by Phase 2 for translated messages): `NOT_SHM_EMAIL`, `INVALID_RANGE`, `NOT_ALIGNED`, `OUTSIDE_HOURS`, `WEEKEND`, `HOLIDAY`, `IN_PAST`, `TOO_FAR_AHEAD`, `BANNED`, `ROOM_TAKEN`, `NOT_OWNER`, `NOT_ADMIN`, `NOT_FOUND`, `NOT_ACTIVE`, `CHECKIN_WINDOW`, `RECIPIENT_NOT_FOUND`, `RECIPIENT_BANNED`, `BAD_RULE`.

## Review Focus

1. **A booking whose end time is exactly 20:00 or whose start is exactly 08:00 Bangkok (01:00 UTC)** must be accepted; 19:30–20:30 and anything crossing midnight must be rejected with `OUTSIDE_HOURS`. → test in Task 3.
2. **A released room (cancelled or no-show) must be bookable again for the same slot.** The exclusion constraint must only cover `confirmed`/`checked_in` rows. → test in Task 3 and Task 6.
3. **Moving a booking by 30 minutes so it overlaps its own old time** (10:00–11:00 → 10:30–11:30) must succeed, not fail with `ROOM_TAKEN`. → test in Task 4.
4. **Check-in after the booking was cancelled, handed over, or already marked no-show** must fail (`NOT_ACTIVE` / `NOT_OWNER`), and the previous owner of a handed-over booking can no longer check in. → tests in Task 6 and Task 7.
5. **A ban cancels series bookings that start in the future, but not bookings already in progress or past**, and a banned person cannot receive a handover. → tests in Task 6 and Task 7.

---

## File Structure

Repo `SW2N/shm-room-booking` (public):

```
docs/superpowers/specs/2026-11-16-shm-room-booking-design.md   (spec, copied in Task 1)
docs/superpowers/plans/2026-11-16-room-booking-structure-plan.md (this plan)
supabase/migrations/
  20261116000001_extensions.sql        Task 1  btree_gist, pg_cron, pgtap
  20261116000002_reference.sql         Task 2  rooms, holidays, profiles, signup trigger, helpers, settings RPC
  20261116000003_bookings.sql          Task 3  bookings table, validation trigger, exclusion constraint
  20261116000004_booking_rpcs.sql      Task 4  create/update/cancel booking, RLS on bookings
  20261116000005_series.sql            Task 5  booking_series, create_series, cancel_series
  20261116000006_checkin_bans.sql      Task 6  bans, check_in, process_no_shows, admin_lift_ban, cron
  20261116000007_handover.sql          Task 7  handovers, hand_over
supabase/seed/
  holidays.sql                          Task 8
  mock.sql                              Task 8
supabase/tests/
  _helpers.sql                          Task 2  test helpers (created inside each test transaction)
  02_reference.test.sql … 08_seed.test.sql   one per task
scripts/run-tests.md                    Task 2  how to run a test file through execute_sql
web/                                    Task 9  Vite placeholder
.github/workflows/pages.yml             Task 9
README.md                               Task 1
```

**How tests run (all tasks):** each `supabase/tests/NN_*.test.sql` file starts with `begin;`, includes the helper functions from `_helpers.sql` (pasted in, since `execute_sql` runs one script), runs `select plan(n);` … `select * from finish();`, and ends with `rollback;`. Run by passing the file's full text to Supabase MCP `execute_sql`. Pass = every row of output starts with `ok`, none with `not ok`.

**Test helpers (`_helpers.sql`, Task 2)** — signatures used by every later test:
- `tests.make_user(p_email text, p_name text default 'Test', p_admin bool default false) returns uuid` — inserts into `auth.users` (id, email, raw_user_meta_data `{"display_name":…,"department":"QA"}`, aud/role `authenticated`), letting the signup trigger create the profile; sets role to admin if asked.
- `tests.act_as(p_user uuid) returns void` — `set local role authenticated` and `set local request.jwt.claims` to `{"sub":"<uuid>","role":"authenticated"}`.
- `tests.act_as_postgres() returns void` — `reset role`.
- `tests.slot(p_days_ahead int, p_hhmm text) returns timestamptz` — the first Monday–Friday non-holiday date at least `p_days_ahead` days after today (Bangkok), at `p_hhmm` Bangkok time. Makes tests independent of when they run.

---

### Task 1: Repo, Supabase project, extensions

**Files:**
- Create: `README.md`, `docs/superpowers/specs/2026-11-16-shm-room-booking-design.md`, `docs/superpowers/plans/2026-11-16-room-booking-structure-plan.md`, `supabase/migrations/20261116000001_extensions.sql`

**Interfaces:**
- Produces: Supabase project `shm-room-booking` (region Southeast Asia / Singapore, free plan); its project ref, URL and publishable key recorded in `README.md`. Repo `SW2N/shm-room-booking`, branch `main`.

- [ ] **Step 1:** Create the public repo: `gh repo create SW2N/shm-room-booking --public --description "SHM meeting room booking"`; clone it; copy spec and plan into `docs/superpowers/…`; commit `docs: add design and phase 1 plan`; push.
- [ ] **Step 2:** With Supabase MCP: `list_organizations` → `create_project` (name `shm-room-booking`, region `ap-southeast-1`). **Requires Sunpawat's approval of the (free) cost in chat.** Wait for status `ACTIVE_HEALTHY` via `get_project`.
- [ ] **Step 3:** Ask Sunpawat to turn off **Authentication → Sign In / Providers → Email → Confirm email** in the Supabase dashboard (no MCP tool for it). Record that it is done in `README.md`.
- [ ] **Step 4:** Migration `extensions`: `create extension if not exists btree_gist; create extension if not exists pg_cron; create extension if not exists pgtap with schema extensions;` Apply with `apply_migration`.
- [ ] **Step 5:** Verify: `execute_sql`: `select extname from pg_extension where extname in ('btree_gist','pg_cron','pgtap') order by 1;` → 3 rows.
- [ ] **Step 6:** Write `README.md` (project URL, publishable key from `get_publishable_keys`, how to run tests, how migrations are applied). Commit `chore: supabase project and extensions`; push.

---

### Task 2: Rooms, holidays, profiles, sign-up rule, settings

**Files:**
- Create: `supabase/migrations/20261116000002_reference.sql`, `supabase/tests/_helpers.sql`, `supabase/tests/02_reference.test.sql`, `scripts/run-tests.md`

**Interfaces:**
- Produces:
  - `rooms(code text pk, building text check in ('Academy','Korn Thong'), name_en text, name_th text, floor int, seats_min int, seats_max int, size_class text check in ('S','M','L','XL'), sort int)` — seeded in this migration with the 9 rows of spec §5, `sort` 1–9 in spec order.
  - `holidays(day date pk, name_th text not null, name_en text)`.
  - `profiles(id uuid pk references auth.users on delete cascade, email text unique not null, display_name text not null, department text, role text not null default 'user' check in ('user','admin'), lang text not null default 'th' check in ('th','en'), year_style text not null default 'BE' check in ('BE','CE'), date_format text not null default 'long' check in ('long','numeric'), no_show_streak int not null default 0, banned_until timestamptz, created_at timestamptz default now())`.
  - `public.is_admin(p_user uuid default auth.uid()) returns boolean`.
  - `public.raise_err(p_code text) returns void` — `raise exception using message = p_code`.
  - `public.update_my_settings(p_lang text, p_year_style text, p_date_format text) returns profiles` (security definer; only own row; nulls leave a value unchanged).
  - Trigger `before insert on auth.users` → `public.enforce_shm_email()` raises `NOT_SHM_EMAIL` unless `lower(new.email) like '%@sahamitproduct.com'`.
  - Trigger `after insert on auth.users` → `public.create_profile()` inserting `profiles(id, email, display_name, department)` from `raw_user_meta_data` (`display_name` falls back to the part of the email before `@`).
  - RLS: `rooms`, `holidays`, `profiles` — `select` for `authenticated`. `holidays` insert/delete only when `is_admin()`. No other write policies (profiles change only through RPCs).

- [ ] **Step 1:** Write `_helpers.sql` with the four helper signatures above, and `scripts/run-tests.md`.
- [ ] **Step 2: Write the failing test** `02_reference.test.sql`, `plan(8)`:
  - `is((select count(*) from rooms), 9::bigint, '9 rooms')`
  - `is((select size_class from rooms where code='KT5-3'), 'XL', 'Champ is XL')`
  - `is((select size_class from rooms where code='AC6-2'), 'L', 'Canteen is L')`
  - `throws_ok($$ insert into auth.users(id,email,aud,role) values (gen_random_uuid(),'x@gmail.com','authenticated','authenticated') $$, 'NOT_SHM_EMAIL')`
  - `lives_ok` for `tests.make_user('Somchai@SahamitProduct.com','Somchai')`, then `is((select display_name from profiles where email ilike 'somchai@%'),'Somchai')`
  - as that user: `update_my_settings('en','CE',null)` → `lang='en'`, `year_style='CE'`, `date_format='long'` (unchanged).
  - as that user: `throws_ok($$ update profiles set role='admin' $$)` or 0 rows updated → role still `'user'` (assert with `is`).
- [ ] **Step 3:** Run via `execute_sql` → fails (tables missing).
- [ ] **Step 4:** Write and apply migration `reference` with everything in **Produces**.
- [ ] **Step 5:** Run test → all `ok`.
- [ ] **Step 6:** Commit `feat: rooms, holidays, profiles, SHM-only sign-up`; push.

---

### Task 3: Bookings table and booking rules

**Files:**
- Create: `supabase/migrations/20261116000003_bookings.sql`, `supabase/tests/03_bookings.test.sql`

**Interfaces:**
- Consumes: `rooms`, `holidays`, `profiles`, `is_admin`, `raise_err`.
- Produces:
  - `bookings(id uuid pk default gen_random_uuid(), room_code text not null references rooms, owner_id uuid not null references profiles, series_id uuid null, title text not null check (length(trim(title)) between 1 and 120), starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'confirmed' check in ('confirmed','checked_in','no_show','cancelled'), checked_in_at timestamptz, cancelled_reason text, created_by uuid references profiles, created_at timestamptz default now())`. (`series_id` FK added in Task 5.)
  - Constraint `bookings_no_overlap`: `exclude using gist (room_code with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status in ('confirmed','checked_in'))`.
  - `public.validate_booking()` trigger `before insert or update of starts_at, ends_at, room_code on bookings`. Checks, in this order, raising the code shown: `ends_at <= starts_at` → `INVALID_RANGE`; minutes not 0/30 or seconds ≠ 0 (Bangkok) → `NOT_ALIGNED`; different Bangkok dates, start < 08:00 or end > 20:00 → `OUTSIDE_HOURS`; then, unless `is_admin(new.owner_id)` or `is_admin(auth.uid())`: Sat/Sun → `WEEKEND`; date in `holidays` → `HOLIDAY`; `banned_until > now()` for owner → `BANNED`; start date > Bangkok today + 3 months → `TOO_FAR_AHEAD`. For everyone: `starts_at < now()` → `IN_PAST`.
  - Bypass for seeding/tests only: the trigger returns `new` unchanged when `session_user = 'postgres'` and `current_setting('app.bypass_rules', true) = 'on'`.

- [ ] **Step 1: Write the failing test** `03_bookings.test.sql`, `plan(13)`, inserting directly as postgres (no bypass) for a normal user `u`, room `KT5-3`, using `tests.slot(…)`:
  - 10:00–11:00 at `slot(7,'10:00')` → `lives_ok`
  - 08:00–08:30 → `lives_ok`; 19:30–20:00 → `lives_ok` (Review Focus 1)
  - 19:30–20:30 → `OUTSIDE_HOURS`; 07:30–08:30 → `OUTSIDE_HOURS`
  - 10:15–11:00 → `NOT_ALIGNED`; 11:00–10:00 → `INVALID_RANGE`
  - next Saturday 10:00–11:00 → `WEEKEND`; same for admin user → `lives_ok`
  - a date inserted into `holidays` first → `HOLIDAY`
  - start 4 months ahead → `TOO_FAR_AHEAD`; same for admin → `lives_ok`
  - same room 10:30–11:30 overlapping the first booking → throws `23P01` (exclusion violation)
  - set the first booking `status='cancelled'`, then re-insert 10:30–11:30 → `lives_ok` (Review Focus 2)
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3:** Write and apply migration `bookings`.
- [ ] **Step 4:** Run → all `ok`.
- [ ] **Step 5:** Commit `feat: bookings table, rules and no-double-booking constraint`; push.

---

### Task 4: Booking RPCs and access rules

**Files:**
- Create: `supabase/migrations/20261116000004_booking_rpcs.sql`, `supabase/tests/04_booking_rpcs.test.sql`

**Interfaces:**
- Consumes: Task 3.
- Produces (all `security definer`, `set search_path = public`, `execute` granted to `authenticated` only):
  - `create_booking(p_room text, p_starts timestamptz, p_ends timestamptz, p_title text) returns bookings` — owner = `auth.uid()`, `created_by = auth.uid()`; maps exclusion violation `23P01` to `ROOM_TAKEN`.
  - `update_booking(p_id uuid, p_room text, p_starts timestamptz, p_ends timestamptz, p_title text) returns bookings` — owner or admin, else `NOT_OWNER`; only `confirmed` bookings (`NOT_ACTIVE`); `23P01` → `ROOM_TAKEN`.
  - `cancel_booking(p_id uuid) returns bookings` — owner or admin; sets `status='cancelled'`, `cancelled_reason='by_owner'` or `'by_admin'`; only `confirmed`/`checked_in` and not yet ended (`NOT_ACTIVE`).
  - RLS on `bookings`: enabled; `select` for `authenticated`; no insert/update/delete policies.
  - View `booking_details` (`security_invoker = true`): bookings joined with room names and owner `display_name`, `department` — what Phase 2 reads.

- [ ] **Step 1: Write the failing test**, `plan(9)`: users `a`, `b`, admin `m`.
  - as `a`: `create_booking('KT5-3', slot(7,'10:00'), slot(7,'11:00'), 'Sales')` → `lives_ok`
  - as `b`: same room/time → `ROOM_TAKEN`
  - as `b`: `cancel_booking(<a's id>)` → `NOT_OWNER`; `update_booking(<a's id>, …)` → `NOT_OWNER`
  - as `a`: `update_booking(id,'KT5-3', slot(7,'10:30'), slot(7,'11:30'),'Sales')` → `lives_ok` (Review Focus 3)
  - as `m`: `cancel_booking(<a's id>)` → `lives_ok`, `cancelled_reason = 'by_admin'`
  - as `a`: `insert into bookings …` directly → throws (RLS, `42501`)
  - as `b`: `select count(*) from booking_details` ≥ 1 (everyone sees all bookings, with owner name)
  - as `a`: `cancel_booking` on the already-cancelled booking → `NOT_ACTIVE`
- [ ] **Step 2:** Run → fails. **Step 3:** Implement and apply. **Step 4:** Run → all `ok`.
- [ ] **Step 5:** Commit `feat: booking RPCs and row-level security`; push.

---

### Task 5: Recurring bookings

**Files:**
- Create: `supabase/migrations/20261116000005_series.sql`, `supabase/tests/05_series.test.sql`

**Interfaces:**
- Consumes: Task 4 (`create_booking` logic; reuse via an internal `_insert_booking(...)` if helpful).
- Produces:
  - `booking_series(id uuid pk, owner_id uuid references profiles, room_code text references rooms, title text, start_time time, end_time time, rule jsonb not null, first_date date, created_at timestamptz default now())`; FK `bookings.series_id → booking_series(id)`.
  - Rule format: `{"freq":"daily"|"weekly"|"monthly","interval":int>=1,"weekdays":[1..7 ISO, weekly only],"until":"YYYY-MM-DD"}`; anything else → `BAD_RULE`. `daily` generates Monday–Friday only.
  - `create_series(p_room text, p_title text, p_first_date date, p_start time, p_end time, p_rule jsonb) returns jsonb` → `{"series_id":uuid,"created":[uuid,…],"skipped":[{"date":"YYYY-MM-DD","reason":"<code>"},…]}`. Each occurrence is attempted independently (sub-transaction per date); any rule/overlap error for that date goes to `skipped` with its code (`ROOM_TAKEN`, `HOLIDAY`, `TOO_FAR_AHEAD`, …). Monthly on a date a month lacks → skipped with `BAD_RULE`. If nothing is created, the series row is not kept and `series_id` is null.
  - `cancel_series(p_series_id uuid, p_from date default null) returns int` — owner or admin; cancels active occurrences starting from `p_from` (default: now) onward; returns count.
  - RLS on `booking_series`: `select` for `authenticated`.

- [ ] **Step 1: Write the failing test**, `plan(7)`:
  - weekly Tue, interval 1, 6 Tuesdays from `slot(7,…)`'s week, 09:30–12:00, nothing in the way → `created` has 6, `skipped` 0
  - pre-book one of those Tuesdays by another user, repeat → 5 created, 1 skipped with `ROOM_TAKEN`
  - weekly series with `until` 5 months ahead as normal user → occurrences past 3 months skipped with `TOO_FAR_AHEAD`; as admin → none skipped for that reason
  - `{"freq":"yearly"}` → `BAD_RULE`
  - `cancel_series` by non-owner → `NOT_OWNER`; by owner → returns 6 and those slots are bookable again
- [ ] **Step 2:** Run → fails. **Step 3:** Implement and apply. **Step 4:** Run → all `ok`.
- [ ] **Step 5:** Commit `feat: recurring bookings`; push.

---

### Task 6: Check-in, no-shows, bans

**Files:**
- Create: `supabase/migrations/20261116000006_checkin_bans.sql`, `supabase/tests/06_checkin_bans.test.sql`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:
  - `bans(id uuid pk, user_id uuid references profiles, starts_at timestamptz, ends_at timestamptz, missed jsonb not null, cancelled_count int not null, lifted_by uuid, lifted_at timestamptz)`. `missed` = array of `{"booking_id","room_code","name_en","name_th","starts_at","ends_at"}` for the 2 missed bookings (Phase 2 builds the "why and impact" message from it). RLS: `select` own rows or admin.
  - `_check_in_at(p_id uuid, p_now timestamptz) returns bookings` — **not** granted to `authenticated`. Owner or admin, else `NOT_OWNER`; status must be `confirmed`, else `NOT_ACTIVE`; `p_now` within `[starts_at − 60 min, starts_at + 15 min]`, else `CHECKIN_WINDOW`. Sets `status='checked_in'`, `checked_in_at=p_now`, owner's `no_show_streak = 0`.
  - `check_in(p_id uuid) returns bookings` = `_check_in_at(p_id, now())`, granted to `authenticated`.
  - `process_no_shows(p_now timestamptz default now()) returns int` — not granted to `authenticated`. For each `confirmed` booking with `starts_at + 15 min <= p_now`, in `starts_at` order: set `status='no_show'`, increment owner's streak; when streak reaches 2: set `banned_until = p_now + 4 hours`, cancel all the owner's `confirmed`/`checked_in` bookings with `starts_at > p_now` (`cancelled_reason='ban'`), insert a `bans` row, reset streak to 0. Returns number of bookings marked no-show.
  - `admin_lift_ban(p_user uuid) returns void` — admin only (`NOT_ADMIN`); sets `banned_until = null`, stamps `lifted_by/lifted_at` on the open `bans` row.
  - `cron.schedule('process-no-shows', '*/5 * * * *', 'select public.process_no_shows()')`.

- [ ] **Step 1: Write the failing test**, `plan(11)`, bookings created with bypass on (so times can be close together), using `p_now` to move the clock:
  - check-in at start − 61 min → `CHECKIN_WINDOW`; at start − 60 min → ok; at start + 16 min → `CHECKIN_WINDOW`
  - non-owner check-in → `NOT_OWNER`; check-in on a cancelled booking → `NOT_ACTIVE` (Review Focus 4)
  - user with streak 0 misses booking 1 → `process_no_shows(start1 + 15min)` returns 1, status `no_show`, streak 1, not banned
  - the released slot can be booked again by another user (Review Focus 2)
  - user checks in to booking 2 → streak 0
  - misses bookings 3 and 4 → after processing: `banned_until = p_now + 4h`, a `bans` row with 2 items in `missed`, streak 0
  - the user's future series occurrence is `cancelled` with reason `ban`, while their booking already in progress (started before `p_now`) stays `checked_in` (Review Focus 5)
  - banned user `create_booking` → `BANNED`
  - non-admin `admin_lift_ban` → `NOT_ADMIN`; admin lift → `banned_until` null, `lifted_by` set
  - `select count(*) from cron.job where jobname='process-no-shows'` = 1
- [ ] **Step 2:** Run → fails. **Step 3:** Implement and apply. **Step 4:** Run → all `ok`.
- [ ] **Step 5:** Commit `feat: check-in, no-show processing and bans`; push.

---

### Task 7: Handover

**Files:**
- Create: `supabase/migrations/20261116000007_handover.sql`, `supabase/tests/07_handover.test.sql`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `handovers(id uuid pk, from_user uuid, to_user uuid, booking_ids uuid[], series_id uuid null, done_by uuid, done_at timestamptz default now())`. RLS: `select` when `auth.uid()` in (`from_user`,`to_user`) or admin.
  - `hand_over(p_booking_id uuid, p_whole_series boolean, p_to_email text) returns int` — caller is the booking's owner or admin (`NOT_OWNER`); booking `confirmed` (`NOT_ACTIVE`); recipient found by case-insensitive email (`RECIPIENT_NOT_FOUND`) and not banned (`RECIPIENT_BANNED`). Single: that booking. Whole series: every `confirmed` occurrence of its series with `starts_at > now()`, plus `booking_series.owner_id`. Sets `owner_id` to the recipient, logs a `handovers` row, returns the number of bookings moved.

- [ ] **Step 1: Write the failing test**, `plan(6)`:
  - owner hands over a single occurrence → returns 1; owner_id = recipient
  - old owner `_check_in_at` that booking inside the window → `NOT_OWNER`; new owner → ok (Review Focus 4)
  - whole series of 4 future occurrences → returns 4, `booking_series.owner_id` = recipient, 1 `handovers` row
  - unknown email → `RECIPIENT_NOT_FOUND`; banned recipient → `RECIPIENT_BANNED` (Review Focus 5)
  - non-owner → `NOT_OWNER`
- [ ] **Step 2:** Run → fails. **Step 3:** Implement and apply. **Step 4:** Run → all `ok`.
- [ ] **Step 5:** Commit `feat: booking handover`; push.

---

### Task 8: Holidays and mock data

**Files:**
- Create: `supabase/seed/holidays.sql`, `supabase/seed/mock.sql`, `supabase/tests/08_seed.test.sql`

**Interfaces:**
- Consumes: all tables above.
- Produces: 24 holiday rows; 6 mock users with emails `mock.<name>@sahamitproduct.com` (display names e.g. "Mock Nok (NF1)"), marked by the `mock.` prefix so they can be deleted later with one statement (document it in `README.md`); about 2 weeks of mock bookings across all 9 rooms starting the next working day, including 3 weekly series (e.g. "MM Meeting" Tue 09:30–12:00 in Champ, "Sale Meeting PCB" Mon 13:30–17:00 in Champ, "NF team meeting" Wed 09:30–12:00 in Soft-D), mirroring the kinds of meetings in the current Excel.

- [ ] **Step 1: Write the failing test**, `plan(4)`: `count(*) from holidays where day between '2026-11-16' and '2027-12-31'` = 15; `holidays` contains `2027-04-13`; mock users = 6; mock bookings ≥ 40 and every room has ≥ 1.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3:** Write `holidays.sql` with exactly these rows (Thai names verbatim from the workbooks; `name_en` filled with the common English name):

```
2026-01-01 วันขึ้นปีใหม่ | 2026-01-02 ชดเชยวันมาฆบูชา (วันอังคารที่ 3 มีนาคม 2569) | 2026-04-13/14/15 วันสงกรานต์
2026-05-01 วันแรงงานแห่งชาติ | 2026-06-03 วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าสุทิดาฯ พระบรมราชินี
2026-07-28 วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว | 2026-08-12 วันแม่แห่งชาติ (full Thai text from workbook)
2026-12-07 ชดเชยวันพ่อแห่งชาติ (full text) | 2026-12-30 ชดเชยวันปิยะมหาราช (วันศุกร์ที่ 23 ตุลาคม 2569) | 2026-12-31 วันสิ้นปี
2027-01-01 วันขึ้นปีใหม่ | 2027-01-04 ชดเชยวันมาฆบูชา (วันอาทิตย์ที่ 21 กุมภาพันธ์ 2570) | 2027-04-13/14/15 วันสงกรานต์
2027-05-03 วันแรงงานแห่งชาติ | 2027-06-03 (as 2026) | 2027-08-12 (as 2026) | 2027-10-13 วันนวมินทรมหาราช
2027-12-06 ชดเชยวันพ่อแห่งชาติ (full text) | 2027-12-30 ชดเชยวันปิยะมหาราช (วันเสาร์ที่ 23 ตุลาคม 2570) | 2027-12-31 วันสิ้นปี
```
  Write `mock.sql` (runs with `set app.bypass_rules = 'on'` only for creating users; bookings go through the normal rules so the mock data is valid).
- [ ] **Step 4:** Apply both via `execute_sql`; run test → all `ok`.
- [ ] **Step 5:** Commit `feat: holidays and mock data`; push.

---

### Task 9: Placeholder web app and automatic publishing

**Files:**
- Create: `web/` (Vite + React + TypeScript scaffold), `web/src/supabase.ts`, `web/src/App.tsx`, `.github/workflows/pages.yml`, `supabase/migrations/20261116000008_public_rooms.sql`

**Interfaces:**
- Consumes: project URL and publishable key (Task 1); `rooms` table.
- Produces: `web/src/supabase.ts` exporting `supabase` (client from `@supabase/supabase-js` using `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, both committed in `web/.env.production` — public by design). Vite `base: '/shm-room-booking/'`. Live site at `https://sw2n.github.io/shm-room-booking/`.

- [ ] **Step 1:** Scaffold with `npm create vite@latest web -- --template react-ts`; add `@supabase/supabase-js`.
- [ ] **Step 2:** `App.tsx` shows "SHM Room Booking — coming soon" and the number of rooms read from `rooms` (anonymous read: add RLS `select` on `rooms` for `anon` in this task's migration `20261116000008_public_rooms.sql`).
- [ ] **Step 3:** `npm run build` → succeeds with no errors.
- [ ] **Step 4:** Workflow `pages.yml`: on push to `main` touching `web/**`, Node 20, `npm ci && npm run build` in `web/`, deploy `web/dist` with `actions/deploy-pages`. Enable Pages with source "GitHub Actions": `gh api -X POST repos/SW2N/shm-room-booking/pages -f build_type=workflow`.
- [ ] **Step 5:** Commit `feat: placeholder app and GitHub Pages publishing`; push.
- [ ] **Step 6:** Verify: `gh run list --workflow pages.yml --limit 1` → `completed success`; `gh api repos/SW2N/shm-room-booking/pages --jq .html_url` → the site URL. Ask Sunpawat to open it and confirm it says 9 rooms.

---

## Notes for Sunpawat (not tasks)

- The 2027 workbook has no row for **28 Jul 2027** (King's Birthday) although 2026 has one. The seed follows the workbooks; you can add it later as admin.
- You become admin after you sign up in Phase 2: one SQL line sets your `role` to `admin`.
