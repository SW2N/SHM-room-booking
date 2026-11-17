# User management (Admin → Users) — design

Approved by Sunpawat, 17 Nov 2026 (answers to the draft: 1 "Okay", 2 "As you recommended", 3 fixed department list).

## Intent
Admins manage who can use the booking system the same way they manage holidays: an editable table with Excel
download/upload, saved together. Removes the need for SQL to make an admin, and lets HR-style list upkeep
(joiners, leavers, department moves) happen in one place.

## Decisions (the user's)
1. **Staff list gates sign-up.** Only emails on the staff list (and active) can create an account.
2. **Disabling someone:** the admin first sees that person's upcoming bookings and can hand chosen ones to a
   colleague; the rest are cancelled when the disable is saved.
3. **Departments are a fixed list:** TA, MKT, SCM, HR, ACC, LAW, FOOD, NF, PCB, BD, OTHERS.

## Approaches considered
- **A. Staff list table separate from accounts (chosen).** `staff` keyed by email holds name, department, role,
  active. Accounts (`profiles`) are created at sign-up and take their name/department/role from the staff row;
  admin edits to a staff row are copied to the matching profile. Works for people who haven't signed up yet.
- B. Create accounts directly from the import. Needs the service-role key in a server function and an email
  service for invitations (Supabase's built-in email sends only a few per hour). Rejected for now.
- C. Edit profiles only. Can't pre-approve people who haven't signed up, so it can't gate sign-up.

## The design (my calls marked *)
- `staff(email pk, display_name, department, role, active, updated_at)`; department and role are checked
  against the fixed lists. Existing accounts are copied in (SW Admin → BD, admin; alin.s → HR).
- `profiles.active` (default true). A disabled person: `active = false`, sign-in refused (auth `banned_until`
  set far in the future*), future bookings not handed over are cancelled with reason `account_disabled`, holds
  dropped. `is_admin()` requires an active profile*. Booking, holding and receiving a handover require an active
  account*. Re-enabling clears the sign-in block.
- Sign-up: the form asks only email + password*; name, department and role come from the staff list.
  `can_sign_up(email)` (callable before signing in) answers `ok` / `NOT_SHM_EMAIL` / `NOT_ON_STAFF_LIST` /
  `ACCOUNT_DISABLED` so the form can explain a refusal*; the auth trigger enforces the same rule.
- `admin_staff_list()` returns every staff row joined with its account: signed up or not, last sign-in,
  upcoming bookings, pause end.
- `admin_save_staff(rows jsonb)` upserts rows (an upload never deletes*), copies changes to profiles, applies
  disable/enable. Guards: admins can't demote or disable themselves; there must always be an active admin.
- Screen: Admin panel gets tabs* — Users · Holidays · Paused accounts. Users tab = table (Email, Name,
  Department ▾, Role ▾, Status ▾, Account, Last sign-in, Upcoming), search + department/role/status filters,
  + Add row, Upload/Download Excel (merged by email; unreadable rows listed by row number), Save changes.
  Disabling opens a review of that person's upcoming bookings with "hand over to" before saving.
  Remove account stays as its own button (for someone who registered a colleague's address).

## Left to the builder
Exact copy, column widths, and how role/status words in Excel are matched (Thai or English, any case).
