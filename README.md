# SHM Room Booking

Meeting-room booking platform for Sahamit Products (9 rooms, Academy and Korn Thong buildings).

- **Design:** `docs/superpowers/specs/2026-11-16-shm-room-booking-design.md`
- **Phase 1 plan:** `docs/superpowers/plans/2026-11-16-room-booking-structure-plan.md`

## Supabase

- Project: `shm-room-booking` (ref `lxhufflxarrwykmvbtna`, region Singapore, org SHM.ORG, free plan)
- API URL: `https://lxhufflxarrwykmvbtna.supabase.co`
- Publishable key (public by design): `sb_publishable_nLrbm7Cp_b4iONCJwTOakQ_PtkFqfoI`
- Auth: email + password, **Confirm email = OFF** (set in dashboard: Authentication → Sign In / Providers → Email). Status: _pending_.

## Database changes

Migrations in `supabase/migrations/` are applied in filename order (applied through the Supabase MCP `apply_migration`).
Seeds in `supabase/seed/`. All rules (no double-booking, hours, holidays, bans) live in the database.

## Tests

See `scripts/run-tests.md`. Each `supabase/tests/*.test.sql` is a pgTAP script wrapped in `begin; … rollback;`.

## Web app

Published at `https://sw2n.github.io/SHM-room-booking/` by GitHub Actions from `web/` on every push to `main`.
