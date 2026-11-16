# SHM Meeting Room Booking — Design

**Date:** 16 Nov 2026 · **Owner:** Sunpawat Wongjumras (BD, SHM) · **Status:** Approved 16 Nov 2026

## 1. Why

SHM books its 9 meeting rooms in an Excel workbook (one tab per room, 30-minute grid). Two problems:

1. **The link changes every year**, so people lose track of where to book.
2. **The grid confuses users**: free-text cells mix the person, team and time ("Ta,Food2,RMR 11:00-12:00"), so it is hard to see what is free and who booked what.

A third problem the new system must fix: **people block a room for a whole year and then don't use it.**

IT support (Exchange admin rights) is not available, so the solution must run without IT.

## 2. Goals, non-goals, anti-goals

**Goals**
- One permanent link that everyone at SHM uses, on phone and computer.
- See at a glance which rooms are free; book in a few taps.
- Every booking shows who made it.
- No double-booking, ever.
- Rooms that are booked but not used get released, and repeat no-shows are penalised.

**Non-goals (v1)**
- Importing the existing Excel bookings (staff re-enter them; app ships with mock data).
- Usage reports / exports.
- Outlook calendar integration.
- Email notifications (wanted later, not v1).

**Anti-goals** (would be a failure even if it technically works)
- Harder to read than the Excel sheet.
- People drift back to Excel because sign-in or rules are a hassle.
- Two people end up holding the same room at the same time.

## 3. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Supabase (data, sign-in, timed jobs) + web app on GitHub Pages** | Free; permanent link; real double-booking protection; Claude can build and change everything directly. Data sits in Supabase (Singapore), outside Microsoft 365. | **Chosen** |
| B. Same as A, hosted on Netlify/Vercel | Nicer URL, same otherwise. No existing account. | Not needed |
| Exchange room mailboxes + Outlook Room Finder | Best Outlook fit, but needs Exchange admin role from IT. | Blocked by IT |
| Power Apps + SharePoint list | No extra license, inside M365, but Claude can't edit it directly. | Rejected |
| Google Sheets + Apps Script (built with Antigravity) | Free hosting, but sign-in is Google-account based (SHM is on Microsoft), weak concurrency on a Sheet, no direct editing from Claude. | Rejected |
| Claude artifact with built-in database | Fastest to build, but only people in the Claude organization can open it. | Rejected |

## 4. Users and access (decided)

- **Who:** everyone at SHM.
- **Sign-in:** each person creates an account. Username = their email, plus a password they choose. Only `@sahamitproduct.com` addresses can register (enforced in the database, not only in the page). At sign-up they also give display name and department.
- **Roles:** `user` and `admin`. Sunpawat is the first admin.
- **Who can change a booking:** only its owner and admins.
- **Everyone can see** all bookings, including title and owner name.
- **Devices:** responsive; works on phone and computer.

## 5. Rooms (decided)

| Building | Name (EN) | Name (TH) | Code (data only) | Floor | Seats | Size |
|---|---|---|---|---|---|---|
| Academy | Gracie | เกรซี่ | AC2-1 | 2 | 10–15 | XL |
| Academy | Hanasol | ฮานาโซล | AC2-2 | 2 | 4–6 | S |
| Academy | Hibaby | ไฮเบบี้ | AC6-1 | 6 | 6–8 | M |
| Academy | Canteen | แคนทีน | AC6-2 | 6 | 8–10 | L |
| Korn Thong | Soft-D | ซอฟท์ดี | KT5-1 | 5 | 6–8 | M |
| Korn Thong | Wow | ว้าว | KT5-2 | 5 | 4–6 | S |
| Korn Thong | Champ | แชมป์ | KT5-3 | 5 | 10–15 | XL |
| Korn Thong | Krua Mae Lek | ครัวแม่เล็ก | KT6-1 | 6 | 6–8 | M |
| Korn Thong | Yok Niw | ยกนิ้ว | KT6-2 | 6 | 4–6 | S |

- Size groups: **S** 4–6 · **M** 6–8 · **L** 8–10 · **XL** 10+.
- The code is never shown to users; it is the key for data and mapping.

## 6. Booking rules (decided)

- **Hours:** 08:00–20:00, in **30-minute steps**.
- **Confirmation:** immediate, no approval.
- **How far ahead:** users up to **3 months**; only admins can book further ahead.
- **Recurring bookings:** supported.
- **Holidays:** Thai public holidays are blocked days (seeded from the 2027/BE 2570 workbook's holiday rows plus the rest of 2026).
- **Double-booking:** impossible — enforced by a database constraint on room + time range, so two simultaneous requests can never both succeed.

## 7. Check-in, no-shows and bans (decided)

- **Check-in:** a **Check in** button on the booking in the app, usable from **1 hour before start until 15 minutes after start**. No QR code (too strict; can be photographed).
- **No-show:** if nobody checks in by start + 15 min, the booking is marked *no-show* and the room is released for others.
- **Ban trigger:** **2 no-shows in a row** by the same owner. Any successful check-in resets the count to zero.
- **Ban effect:** for **4 hours** the person cannot make new bookings, and **all their future bookings (including every recurring series) are cancelled**.
- **Ban message:** when a banned person opens the app, they see why (which bookings were missed, when) and the impact (e.g. "Champ was held empty 13:30–17:00 on 16 Nov while colleagues could not book it").
- **Admin:** can lift a ban early.
- After a ban ends, the no-show count starts again from zero.

## 8. Handover (decided)

- The owner can hand a booking to another SHM user — **one occurrence or the whole recurring series** — e.g. when going on a business trip or leave.
- The receiver becomes the owner immediately (no accept step) and is responsible for check-in.
- Every handover is logged (from, to, when, which bookings).

## 9. What people see (decided)

- **Layout:** split screen. **Left:** room list grouped by building, with size filter chips (S/M/L/XL). **Right:** calendar with **Day / Week / Month** views.
- **Language:** Thai and English toggle; rooms shown by name only (no code).
- **Date display:** toggle **Buddhist / Western year** (พ.ศ./ค.ศ.) and toggle **date format** (e.g. "16 พ.ย. 2569" vs "16/11/2026"). Saved per user.
- **Phone:** room list collapses into a dropdown above the calendar.

## 10. Data

- Ships with **mock bookings** (about 2 weeks, all 9 rooms, a few mock users and recurring series) so people can try it.
- Real bookings are re-entered by staff after launch.

## 11. Builder's calls (Claude's proposals — change any)

1. **Stack:** React + Vite, FullCalendar (free edition) for the calendar, Supabase JS client. Built by GitHub Actions and published to GitHub Pages from a repo under the `SW2N` account.
2. **Repo is public.** Free GitHub Pages needs a public repo. No secrets live in it: the Supabase public key is designed to be public, and all protection is in database rules (row-level security).
3. **Calendar shows selected rooms.** Clicking a room on the left shows that room; ticking several shows them together, colour-coded. (A side-by-side "rooms as columns" view is a paid FullCalendar feature, so it is not used.)
4. **Weekends:** bookable hours apply Monday–Friday; weekends are shown greyed and not bookable (as in the Excel sheet). Admins can still book them.
5. **Recurrence options:** daily, weekly on chosen weekdays, every N weeks, monthly on the same date — with an end date. Occurrences are created as individual bookings. If some dates clash, the user sees the clashes and can book the rest.
6. **Timed jobs:** a database job runs every 5 minutes to mark no-shows, release rooms, apply and lift bans.
7. **Timezone:** everything in Asia/Bangkok.
8. **Supabase region:** Singapore. Free tier; the project pauses only after 7 days with no use, which daily use prevents.

## 12. Sign-up email confirmation (decided)

**No email confirmation at launch** (option a). Anyone with an `@sahamitproduct.com` address can register immediately. If someone registers a colleague's address, the admin deletes that account. A proper email service can be added later together with notifications. Password reset uses Supabase's built-in email (fine at low volume).

## 13. Build order (decided)

1. **Structure first:** Supabase project, database tables, sign-up/sign-in rules, booking rules (no double-booking, 3-month limit, holidays, weekends), check-in/no-show/ban jobs, handover, admin powers, holidays and mock data, and the GitHub repo with automatic publishing.
2. **Screens second:** the user interface is designed and built in a later step, using the design skills, on top of the finished structure.
