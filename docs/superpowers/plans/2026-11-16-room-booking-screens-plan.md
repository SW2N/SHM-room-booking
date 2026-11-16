# SHM Room Booking — Phase 2 (Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the booking web app on the live Phase 1 back end: sign-in, the A-over-B main screen, booking/details/handover/check-in, my bookings, settings, ban pop-up, admin — with live updates and holds while someone books.

**Architecture:** One React + Vite single-page app in `web/`, published to GitHub Pages by the existing workflow. All rules stay in the database; the app calls the Phase 1 RPCs and reads `rooms`, `holidays`, `booking_details`, `holds`, `my_profile()`. Pure logic (dates, availability, error text, recurrence form → rule JSON) lives in small tested modules; components stay thin. Supabase Realtime pushes `bookings` and `holds` changes to every open screen.

**Tech Stack:** React 19, Vite 8, TypeScript, `@supabase/supabase-js` 2, FullCalendar 6 free (`@fullcalendar/react`, `daygrid`, `timegrid`, `interaction`), Vitest + Testing Library for unit tests, pgTAP for back-end tests (suite in schema `tests`).

**Spec:** `docs/superpowers/specs/2026-11-16-shm-room-booking-screens-design.md` (and Phase 1: `docs/superpowers/specs/2026-11-16-shm-room-booking-design.md`)

## Global Constraints

- Page URL `https://sw2n.github.io/SHM-room-booking/` (Vite `base: '/SHM-room-booking/'`); Supabase `https://lxhufflxarrwykmvbtna.supabase.co`, publishable key in `web/.env.*`.
- Bookable grid: 08:00–20:00 Asia/Bangkok, 30-minute steps; times chosen from dropdowns only.
- Size groups: S 4–6 · M 6–8 · L 8–10 · XL 10+ (from `rooms.size_class`). Room code never shown.
- Languages TH (default) / EN; year พ.ศ. (default) / ค.ศ.; date format `long` ("24 พ.ย. 2569") / `numeric` ("24/11/2569" or "24/11/2026") — per user via `update_my_settings`.
- Check-in: from 00:00 Bangkok on the booking day until start + 15 min. No-show rule unchanged.
- Holds: placed when the booking form / time edit opens; released on save or close; expire after **5 minutes**; renewed every **60 s** while the form is open. Others' booking into a live hold → `ROOM_HELD`.
- Live updates via Supabase Realtime on `bookings` and `holds` — no timer polling.
- Neutral style: light surfaces, one accent colour, green = free, grey = taken, striped = held, red only for errors. Font stack `"Noto Sans Thai", system-ui, sans-serif`.
- UI copy: sentence case, verb-first buttons, no "please"/"successfully"; every back-end error code has a TH and EN message.
- Other people's ban status is never read (only `my_profile()`).

## Review Focus

1. **Midnight / date-boundary handling in Bangkok time** — a user in any browser time zone must see 08:00 Bangkok as 08:00; a booking on 31 Dec 2026 (holiday) must show as a holiday, and BE year 2569 ↔ CE 2026 must convert both ways. → tests in Task 2 (`dates.test.ts`).
2. **A hold left behind** (tab closed, phone locked) must stop blocking others within 5 minutes, and the owner's own hold must never block their own save. → tests in Task 1 (pgTAP) and Task 7 (`useHold.test.ts`).
3. **Two people opening the same free slot at nearly the same time** — the second must get a clear "someone is booking this now" message, not a blank error. → Task 1 test + Task 2 `errors.test.ts`.
4. **Free/taken state for a partly overlapping booking** (e.g. chosen 14:00–15:30, booking 15:00–16:00) must show "taken"; a booking ending exactly at 14:00 must not. → Task 3 `availability.test.ts`.
5. **Series form edge cases** — monthly on the 31st, "every 2 weeks", end date before start — must produce the documented rule JSON or a form error before calling the server. → Task 7 `recurrence.test.ts`.

---

## File Structure

```
supabase/migrations/20261116000018_checkin_day_and_holds.sql   Task 1
supabase/tests/12_holds_checkin.test.sql                         Task 1 (+ install migration …0019)
web/src/
  lib/
    dates.ts            Task 2  Bangkok time, BE/CE, formats, 30-min slots
    errors.ts           Task 2  error code → {th,en} message
    i18n.ts             Task 2  UI strings TH/EN + t(key)
    availability.ts     Task 3  free / taken / held for a room and range
    recurrence.ts       Task 7  repeat form → rule JSON + validation
    api.ts              Task 3  typed wrappers for every RPC / select
  state/
    session.tsx         Task 2  auth session + my_profile, SessionProvider/useSession
    data.tsx            Task 3  rooms, holidays, bookings, holds + Realtime, DataProvider/useData
    useHold.ts          Task 7  place / renew / release hold
  components/
    AuthScreen.tsx      Task 2  sign in / sign up / forgot / reset
    TopBar.tsx          Task 2  title, my bookings button, settings, admin, sign out
    SettingsModal.tsx   Task 2
    BanPopup.tsx        Task 2
    SearchBar.tsx       Task 4  date, start–end, size chips
    RoomList.tsx        Task 4  A-left
    RoomCalendar.tsx    Task 5  A-right (FullCalendar)
    DayTimeline.tsx     Task 6  B
    BookingForm.tsx     Task 7
    BookingDetails.tsx  Task 8  check in, edit, cancel, hand over
    MyBookings.tsx      Task 9
    AdminPanel.tsx      Task 9
    Modal.tsx, Toast.tsx  Task 2  shared
  App.tsx, main.tsx, styles.css   Task 2
  *.test.ts(x) next to the module they test
```

---

### Task 1: Back end — check-in on the day, holds, live updates

**Files:** Create `supabase/migrations/20261116000018_checkin_day_and_holds.sql`, `supabase/tests/12_holds_checkin.test.sql`, `supabase/migrations/20261116000019_test_holds_checkin.sql` (installs the test as `tests.t_12_holds_checkin`). Modify `supabase/tests/06_checkin_bans.test.sql` (+ reinstall `tests.t_06_checkin_bans`).

**Interfaces — Produces:**
- `_check_in_at(p_id, p_now)`: window `[ (starts_at in Bangkok)::date 00:00 Bangkok , starts_at + 15 min ]`, else `CHECKIN_WINDOW`.
- `holds(id uuid pk, room_code text → rooms, starts_at timestamptz, ends_at timestamptz, user_id uuid → profiles, booking_id uuid null → bookings, expires_at timestamptz)`; RLS select for authenticated; in publication `supabase_realtime` together with `bookings`.
- `place_hold(p_room text, p_starts timestamptz, p_ends timestamptz, p_booking_id uuid default null) returns holds` — deletes the caller's other holds, refuses if another person's live hold overlaps (`ROOM_HELD`) or an active booking (other than `p_booking_id`) overlaps (`ROOM_TAKEN`); `expires_at = now() + 5 min`.
- `renew_hold(p_id uuid) returns holds` — own hold only (`NOT_OWNER`), `expires_at = now() + 5 min`.
- `release_hold(p_id uuid) returns void` — own hold only; no error if already gone.
- `create_booking`, `update_booking`, `create_series` (per date → skipped reason) raise / report `ROOM_HELD` when another person's hold with `expires_at > now()` overlaps; the caller's own hold for that range is deleted on success.
- Cron `purge-holds` every 5 min deletes expired holds.
- `booking_details` unchanged.

- [ ] **Step 1: Failing test** `12_holds_checkin.test.sql` `plan(10)`:
  - check-in at 00:00 Bangkok of the booking day → `ok`; at 23:59 the day before → `CHECKIN_WINDOW`; at start + 16 min → `CHECKIN_WINDOW`
  - A `place_hold(KT5-1, s, e)` → ok; B `create_booking(KT5-1, s, e)` → `ROOM_HELD`; B `place_hold` overlapping → `ROOM_HELD`
  - A `create_booking(KT5-1, s, e)` → ok and A's hold is gone
  - expired hold (set `expires_at = now() - 1s`) no longer blocks B → ok
  - B `release_hold(A's hold)` → `NOT_OWNER`
  - `select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('bookings','holds')` = 2
- [ ] **Step 2:** Update `06` check-in cases: "1 hour before" → assert `00:00` of the day is ok and the day before is `CHECKIN_WINDOW`.
- [ ] **Step 3:** Run new test (install + run in one rolled-back `execute_sql`) → fails.
- [ ] **Step 4:** Write and apply migration `…0018`; install tests (`…0019`, reinstall t_06).
- [ ] **Step 5:** `select * from tests.suite(); rollback;` → every row `failed = 0`.
- [ ] **Step 6:** Commit `feat: check-in on the day, holds while booking, realtime`.

### Task 2: App shell — styles, i18n, dates, errors, sign-in, settings, ban pop-up

**Files:** Create `web/src/lib/{dates,errors,i18n}.ts`, their `*.test.ts`, `web/src/state/session.tsx`, `web/src/components/{AuthScreen,TopBar,SettingsModal,BanPopup,Modal,Toast}.tsx`, `web/src/styles.css`, `web/vitest.config.ts`; modify `web/src/App.tsx`, `web/src/main.tsx`, `web/package.json` (add `vitest`, `@testing-library/react`, `jsdom`, script `"test": "vitest run"`).

**Interfaces — Produces:**
- `dates.ts`: `TZ = 'Asia/Bangkok'`; `bkkDate(ts: Date|string): string /* YYYY-MM-DD */`; `bkkTime(ts): string /* HH:MM */`; `toTimestamp(date: string, hhmm: string): string /* ISO with +07:00 */`; `SLOTS: string[] /* '08:00'…'20:00' step 30 */`; `formatDate(date: string, opts: {lang:'th'|'en'; year:'BE'|'CE'; format:'long'|'numeric'}): string`; `formatRange(startIso, endIso, opts): string`.
- `errors.ts`: `errorMessage(e: unknown, lang): string` — maps every code in Phase 1 Global Constraints plus `ROOM_HELD`, `NOT_ALLOWED`, auth errors (`Invalid login credentials`, `User already registered`) to TH/EN; unknown → generic "Something went wrong. Try again." / "เกิดข้อผิดพลาด ลองอีกครั้ง".
- `i18n.ts`: `t(key: string, lang): string`, all UI strings in one object.
- `session.tsx`: `SessionProvider`, `useSession(): { session, profile: Profile|null, refreshProfile(), signOut() }`; `Profile` = row of `my_profile()`.
- `Modal({open, title, onClose, children})`, `Toast` via `useToast(): (msg: string) => void`.

- [ ] **Step 1: Failing tests** `dates.test.ts`: `formatDate('2026-11-24', {lang:'th',year:'BE',format:'long'})` = `'24 พ.ย. 2569'`; `{lang:'en',year:'CE',format:'numeric'}` = `'24/11/2026'`; `{lang:'th',year:'BE',format:'numeric'}` = `'24/11/2569'`; `toTimestamp('2026-11-24','08:00')` = `'2026-11-24T08:00:00+07:00'`; `bkkTime('2026-11-24T01:00:00Z')` = `'08:00'`; `bkkDate('2026-12-30T17:30:00Z')` = `'2026-12-31'`; `SLOTS.length` = 25, first `'08:00'`, last `'20:00'`. `errors.test.ts`: `errorMessage({message:'ROOM_HELD'},'th')` contains `'กำลังจอง'`; `'en'` = `'Someone is booking this room right now. Pick another time or room.'`; unknown → generic.
- [ ] **Step 2:** `npm test` → fails (modules missing).
- [ ] **Step 3:** Implement modules (use `Intl.DateTimeFormat` with `timeZone: TZ` and Thai month abbreviations; BE = CE + 543), session, auth screen (sign in, sign up with display name + department, forgot password → `resetPasswordForEmail` with `redirectTo` = page URL, set new password on `PASSWORD_RECOVERY` event), top bar, settings modal (`update_my_settings`), ban pop-up (shown when `profile.banned_until > now`; reads own `bans` row: missed bookings, end time; copy "You missed {room} {time} and {room} {time}. Those rooms sat empty while colleagues couldn't book them. You can book again at {time}."), `styles.css` tokens (accent, free, taken, held stripe, danger).
- [ ] **Step 4:** `npm test` → pass; `npm run build` → no errors.
- [ ] **Step 5:** Commit `feat: app shell, sign-in, settings, ban pop-up`.

### Task 3: Data layer — API wrappers, live data, availability

**Files:** Create `web/src/lib/api.ts`, `web/src/lib/availability.ts`, `web/src/lib/availability.test.ts`, `web/src/state/data.tsx`.

**Interfaces — Produces:**
- Types: `Room {code,building,name_en,name_th,floor,seats_min,seats_max,size_class,sort}`, `Holiday {day,name_th,name_en}`, `Booking` (= `booking_details` row), `Hold {id,room_code,starts_at,ends_at,user_id,booking_id,expires_at}`.
- `api.ts`: `createBooking(room, startIso, endIso, title)`, `updateBooking(id, room, startIso, endIso, title)`, `cancelBooking(id)`, `createSeries(room, title, firstDate, start, end, rule)` → `{series_id, created, skipped}`, `cancelSeries(seriesId, fromDate?)`, `checkIn(id)`, `handOver(id, wholeSeries, email)`, `acknowledgeHandovers()`, `placeHold(room, startIso, endIso, bookingId?)`, `renewHold(id)`, `releaseHold(id)`, `adminLiftBan(userId)`, `adminRemoveUser(userId)`, `addHoliday(day, nameTh, nameEn)`, `deleteHoliday(day)`, `findProfileByEmail(email)` — each throws the Supabase error unchanged.
- `availability.ts`: `overlaps(aStart, aEnd, bStart, bEnd): boolean` (half-open `[start, end)`); `roomState(room: string, startIso, endIso, bookings: Booking[], holds: Hold[], myId: string): 'free'|'taken'|'held'` — active statuses `confirmed`,`checked_in`; holds count only if `expires_at > now` and `user_id !== myId`.
- `data.tsx`: `DataProvider` loads rooms, holidays, bookings for `[from, to]` (the visible range; default today−7 … today+45), holds; subscribes to Realtime `postgres_changes` on `bookings` and `holds` and refetches the changed range; `useData(): { rooms, holidays, bookings, holds, setRange(from, to), reload() }`.

- [ ] **Step 1: Failing test** `availability.test.ts`: booking 15:00–16:00 vs chosen 14:00–15:30 → `'taken'`; booking 13:00–14:00 vs 14:00–15:30 → `'free'`; cancelled booking overlapping → `'free'`; someone else's live hold overlapping → `'held'`; my own hold → `'free'`; expired hold → `'free'`.
- [ ] **Step 2:** `npm test` → fails. **Step 3:** Implement. **Step 4:** `npm test` → pass; build ok.
- [ ] **Step 5:** Commit `feat: data layer with live updates and availability`.

### Task 4: Search bar and room list (A-left)

**Files:** Create `web/src/components/SearchBar.tsx`, `RoomList.tsx`, `RoomList.test.tsx`; modify `App.tsx`.

**Interfaces — Produces:** app-level state `search: { date: string; start: string|null; end: string|null; sizes: ('S'|'M'|'L'|'XL')[] }`, `selectedRoom: string`; `RoomList({rooms, search, onSelect, onBook})`.

- [ ] **Step 1: Failing test** `RoomList.test.tsx` (mock `useData`/`useSession`): with search 14:00–15:30 and a booking in KT5-1 14:00–15:00, the Soft-D row shows `ไม่ว่าง`; Wow shows `ว่าง`; size filter `['S']` shows only Hanasol, Wow, Yok Niw; no time chosen → no free/taken labels; codes like `KT5-1` never appear in the output.
- [ ] **Step 2:** fails. **Step 3:** Implement: rows grouped Academy then Korn Thong, sorted by `sort`; name in current language, floor, seats; state label; selected row highlighted; "Book <room> <time>" button when the selected room is free. End-time dropdown only offers slots after the start. Default on open: today, no time chosen, all sizes, first room (by `sort`) selected.
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: search bar and room list`.

### Task 5: Room calendar (A-right)

**Files:** Create `web/src/components/RoomCalendar.tsx`, `web/src/lib/calendarEvents.ts`, `calendarEvents.test.ts`; add FullCalendar packages.

**Interfaces — Produces:** `toEvents(roomCode, bookings, holds, myId, lang): EventInput[]` (bookings → title + owner name, class `ev-mine` / `ev-other` / `ev-checked`; others' live holds → class `ev-held` with title "กำลังจองโดย <name>" / "Being booked by <name>"); `RoomCalendar({room, search, onSlotClick(startIso,endIso), onEventClick(bookingId)})`.

- [ ] **Step 1: Failing test** `calendarEvents.test.ts`: cancelled and no-show bookings are excluded; a held slot yields one event with class `ev-held`; titles use owner name.
- [ ] **Step 2:** fails. **Step 3:** Implement: views `timeGridDay`, `timeGridWeek`, `dayGridMonth`; `slotMinTime 08:00`, `slotMaxTime 20:00`, `slotDuration 00:30`, `timeZone 'Asia/Bangkok'`, locale th/en; weekends and holidays shaded via background events (holiday name shown); chosen search range outlined as a background event; selecting empty slots calls `onSlotClick` (weekends and holidays selectable only when `profile.role === 'admin'`); default view `timeGridDay`; navigation updates `setRange`.
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: room calendar day/week/month`.

### Task 6: All-rooms day timeline (B)

**Files:** Create `web/src/components/DayTimeline.tsx`, `web/src/lib/timeline.ts`, `timeline.test.ts`.

**Interfaces — Produces:** `blockPosition(startIso, endIso): {left: number; width: number}` as percentages of 08:00–20:00 (clamped 0–100); `slotAt(xPercent): string` (30-min slot at a click position); `DayTimeline({date, search, onSelectRoom(code), onSlotClick(code, startIso, endIso)})`.

- [ ] **Step 1: Failing test** `timeline.test.ts`: 08:00–09:00 → `{left: 0, width: 8.333}` (±0.01); 19:30–20:00 → `{left: 95.833, width: 4.167}`; `slotAt(50)` = `'14:00'`; `slotAt(99.9)` = `'19:30'`.
- [ ] **Step 2:** fails. **Step 3:** Implement CSS grid: rows = rooms filtered by size, hour labels 08–20, blocks for bookings (tooltip title + owner), striped blocks for others' holds, chosen time band; click row label → `onSelectRoom`; click empty area → `onSlotClick` with a 30-min slot (or the search range if it covers that point); horizontal scroll under 720px width.
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: all-rooms day timeline`.

### Task 7: Booking form with repeat and holds

**Files:** Create `web/src/lib/recurrence.ts`, `recurrence.test.ts`, `web/src/state/useHold.ts`, `useHold.test.ts`, `web/src/components/BookingForm.tsx`.

**Interfaces — Produces:**
- `recurrence.ts`: `type RepeatForm = {kind:'none'|'daily'|'weekly'|'monthly'; interval:number; weekdays:number[]; until:string}`; `toRule(form, firstDate): {ok:true; rule:object|null} | {ok:false; error:'UNTIL_BEFORE_START'|'NO_WEEKDAYS'|'BAD_INTERVAL'}` producing exactly the Phase 1 rule JSON (`freq`, `interval`, `weekdays` ISO 1–7, `until`).
- `useHold(room, startIso, endIso, bookingId?)`: places on mount / when inputs change (releases the previous one), renews every 60 s, releases on unmount; returns `{ status: 'held'|'blocked'|'error', error?: unknown }`.
- `BookingForm({initial: {room, date, start, end, title?, bookingId?}, onClose, onSaved})`.

- [ ] **Step 1: Failing tests** `recurrence.test.ts`: weekly Tue every 2 weeks until 2027-01-31 → `{freq:'weekly',interval:2,weekdays:[2],until:'2027-01-31'}`; monthly from 2026-12-31 → `{freq:'monthly',interval:1,until:…}` (server skips missing dates); `until` before first date → `UNTIL_BEFORE_START`; weekly with no days → `NO_WEEKDAYS`; interval 0 → `BAD_INTERVAL`; kind none → `rule: null`. `useHold.test.ts` (fake timers, mocked api): places once, renews after 60 s, releases on unmount; a `ROOM_HELD` error → status `blocked`.
- [ ] **Step 2:** fails. **Step 3:** Implement form: room (dropdown, names only), date, start/end dropdowns (`SLOTS`), title (required, ≤120), repeat section; while open it holds the range via `useHold` (blocked → inline message from `errorMessage`, Save disabled with reason shown); Save → `createBooking` or `createSeries` (or `updateBooking` when `bookingId`), then show skipped dates list with reasons (if any) before closing; toast "จองแล้ว" / "Booked".
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: booking form with repeat and holds`.

### Task 8: Booking details — check in, edit, cancel, hand over

**Files:** Create `web/src/components/BookingDetails.tsx`, `web/src/lib/bookingActions.ts`, `bookingActions.test.ts`.

**Interfaces — Produces:** `allowedActions(b: Booking, me: Profile, now: Date): {checkIn:boolean; edit:'full'|'titleEnd'|false; cancel:boolean; handOver:boolean; isSeries:boolean}`; `BookingDetails({bookingId, onClose, onEdit(bookingId)})`.

- [ ] **Step 1: Failing test** `bookingActions.test.ts`: owner, booking today 14:00, now 00:05 same day → `checkIn true`; now 23:59 previous day → false; now start+16 min → false; not owner, not admin → all false; admin → all true except `checkIn` follows the same day/time rule; started booking → `edit 'titleEnd'`, `handOver false`; checked-in → `checkIn false`, `edit 'titleEnd'`.
- [ ] **Step 2:** fails. **Step 3:** Implement modal: title, room, time (formatted per settings), owner name and department, status; buttons per `allowedActions`; Cancel and Hand over ask "This date only / Whole series" when `series_id`; hand over asks for colleague email; errors via `errorMessage`; toasts.
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: booking details and actions`.

### Task 9: My bookings and admin panel

**Files:** Create `web/src/components/MyBookings.tsx`, `MyBookings.test.tsx`, `web/src/components/AdminPanel.tsx`; modify `TopBar.tsx` (badge with count of handed-to-me unseen bookings), `App.tsx`.

**Interfaces — Consumes:** `useData().bookings` (own: `owner_id === profile.id`, `starts_at >= today`), `handover_unseen`.

- [ ] **Step 1: Failing test** `MyBookings.test.tsx`: handed-over unseen bookings appear first under "ส่งต่อมาให้คุณ" / "Handed to you"; opening the panel calls `acknowledgeHandovers` once; today's confirmed booking shows a Check-in button.
- [ ] **Step 2:** fails. **Step 3:** Implement panel (side sheet; phone: full screen) and admin panel (role admin only): banned people list via `bans` (admin can read all) with "Lift ban"; remove account by email (confirm dialog, `adminRemoveUser`); holidays list with add/delete.
- [ ] **Step 4:** pass; build ok. **Step 5:** Commit `feat: my bookings and admin panel`.

### Task 10: Publish and verify

- [ ] **Step 1:** `npm test` (all) → pass; `npm run build` → no errors; `npx oxlint` → no errors.
- [ ] **Step 2:** Push to `main`; `gh api repos/SW2N/SHM-room-booking/actions/runs --jq '.workflow_runs[0].conclusion'` → `success`.
- [ ] **Step 3:** Back-end suite `select * from tests.suite(); rollback;` → all `failed = 0`; advisors (security) → no new ERROR-level findings.
- [ ] **Step 4:** Ask Sunpawat to open the page, sign in as SW Admin, and try: book a free room, see it appear on a second device instantly, open the form on one device and see the slot striped on the other, check in, hand over, open Settings.
