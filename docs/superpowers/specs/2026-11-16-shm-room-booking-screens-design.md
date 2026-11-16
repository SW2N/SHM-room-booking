# SHM Meeting Room Booking — Phase 2: Screens design

**Date:** 16 Nov 2026 · **Owner:** Sunpawat Wongjumras (SW Admin) · **Status:** Draft for approval
**Builds on:** `2026-11-16-shm-room-booking-design.md` (Phase 1 back end, done: Supabase project `lxhufflxarrwykmvbtna`, 104 tests green)

## 1. Why

Replace the yearly Excel booking sheet with one permanent page (`https://sw2n.github.io/SHM-room-booking/`) that is easier to read than the Excel grid. People usually arrive with **a date and time in mind** and need a room; the second case is **"find any free room"**.

## 2. Goals, non-goals, anti-goals

**Goals**
- From opening the page to a confirmed booking in under a minute, on phone or computer.
- See at once which rooms are free at a chosen time, and how the whole day looks across rooms.
- Every booking shows who made it. Owners can check in, edit, cancel and hand over.

**Non-goals (Phase 2)**: email notifications, usage reports, Outlook integration, importing Excel data.

**Anti-goals**: harder to read than the Excel sheet; clutter; a sign-up/sign-in that makes people give up.

## 3. Approaches (how it is built)

| Approach | Trade-off | Decision |
|---|---|---|
| **React + Vite (existing placeholder), FullCalendar free edition for A's day/week/month, custom CSS grid for B's timeline, own small neutral stylesheet** | Builds on what's live; free; full control of the B timeline | **Chosen (Claude's call)** |
| React + a UI kit (Mantine / shadcn) | Faster components, heavier bundle, generic look | Not needed |
| FullCalendar Premium "resource timeline" for B | Ready-made multi-room timeline, but paid licence | Rejected |

## 4. Main screen (decided)

One shared **search bar** on top: **date** · **start–end time** (30-min steps, 08:00–20:00) · **size chips S / M / L / XL**.

**Top section — A (split screen)**
- **Left:** room list grouped by building (Academy, Korn Thong), each row: Thai/English name (no code), floor, seats. For the chosen time each room shows **ว่าง / Free** or **ไม่ว่าง / Taken**. Size chips filter the list. Selecting a free room shows a **Book** button pre-filled with room + time.
- **Right:** calendar of the selected room, switchable **Day / Week / Month**. Weekends and holidays greyed with the holiday name. Each booking shows title and owner name. The chosen time is outlined.
- If no time is chosen, the list just shows rooms (no free/taken) — the "find any free room" case uses B below.

**Bottom section — B (all rooms, one day)**
- Rows = rooms (respecting the size filter), columns = 08:00–20:00. Bookings as blocks (title + owner on hover/tap). Chosen time highlighted as a column band.
- Click a row → selects that room in A. Click an empty spot → opens the booking form at that room and 30-min slot.
- Phone: B scrolls sideways; A stacks (list above calendar).

## 5. Other screens and pop-ups (decided)

- **Sign in / Sign up**: email + password; sign-up asks display name and department; only `@sahamitproduct.com` accepted (back end enforces; page explains). "Forgot password" link.
- **Booking form** (modal): room, date, start, end, title; **Repeat**: none / daily / weekly on chosen days / every N weeks / monthly, with end date. After saving, show any dates that could not be booked and why.
- **Booking details** (modal on click): title, room, time, owner. For owner or admin: **Check in** (only on the booking day, until 15 min after start), **Edit** (after start: title and end time only), **Cancel** (this date / whole series), **Hand over** (this date / whole series, to a colleague's email).
- **My bookings** panel: upcoming own bookings; **handed-to-you** bookings at the top, clearly marked. Opening it calls `acknowledge_handovers()` (counts as seen). Today's bookings have a Check-in button.
- **Pop-ups**: ban (why — the missed bookings; impact — the rooms held empty and when; when the ban ends), errors in plain Thai/English per error code, short confirmations ("Booked", "Checked in").
- **Settings**: language TH/EN, year พ.ศ./ค.ศ., date format long/numeric — saved per person (`update_my_settings`).
- **Admin (role = admin only)**: lift a ban, remove an account, add/delete holidays.

## 6. Back-end change needed (decided)

**Check-in window** becomes: from **00:00 (Bangkok) on the booking day** until **15 minutes after start**. No-show rule unchanged (not checked in by start + 15 min). Update `_check_in_at` with a failing test first; update test `06` cases that assumed the 1-hour window.

**Live updates (decided):** every screen updates instantly when anyone books, edits, cancels, checks in or hands over (Supabase Realtime on `bookings` and `holds`), not on a timer.

**Holds while booking or editing (decided):** opening the booking form, or editing a booking's time/room, places a **hold** on that room and time range for that person. Others see the slot striped as "being booked by <name>" and cannot select it. The hold is released on save or close. Back end: new `holds` table (room, start, end, user, expires_at); `place_hold` / `release_hold` RPCs; `create_booking`, `create_series` and `update_booking` refuse a range overlapping someone else's live hold with **`ROOM_HELD`**; holds are readable by signed-in users and included in Realtime.

## 7. Look (decided)

Clean neutral style: white/light-grey surfaces, one accent colour for selection and the primary button, green for free, muted grey for taken, red only for errors. Thai-friendly font (Noto Sans Thai / system). No SHM branding.

## 8. Builder's calls (Claude's proposals — change any)

1. **Default view on open:** today, no time chosen, all sizes, first room selected, A in Day view.
2. **Language default** Thai; dates default พ.ศ. long format (`24 พ.ย. 2569`) as stored in the profile.
3. **Hold expiry:** an untouched hold expires after **5 minutes**; while the form stays open it renews itself every minute.
4. **Data reads:** `booking_details` view for bookings; `rooms`; `holidays`; `my_profile()` for the signed-in person (other people's ban status is not readable).
5. **Error text:** one Thai + English message per back-end error code (`ROOM_TAKEN`, `HOLIDAY`, `BANNED`, `CHECKIN_WINDOW`, …).
6. **Time inputs** are dropdowns of 30-minute steps, so invalid times can't be typed.
7. **Mock data** stays until Sunpawat says to remove it before launch.
8. **Admins** see weekends as bookable and no 3-month limit in the form; everyone else sees them greyed out.
9. **Forgot password** needs one dashboard setting by Sunpawat: Supabase → Authentication → URL Configuration → Site URL = `https://sw2n.github.io/SHM-room-booking/`.

## 9. Left to the builder

Component structure, state management (React hooks, no extra library), exact spacing/typography, icons, loading and empty states — following §7 and keeping it uncluttered.
