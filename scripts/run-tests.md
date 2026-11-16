# Running the database tests

Test helpers (`tests.make_user`, `tests.act_as`, `tests.act_as_postgres`, `tests.slot`, `tests.try`, `tests.val`) live
in schema `tests` (migrations `…0002_test_helpers.sql`, `…0005_test_helpers_try.sql`; source `supabase/tests/_helpers.sql`).
The schema is not exposed through the API.

Each `supabase/tests/NN_*.test.sql` file is the body of a PL/pgSQL function (`return next <assertion>;`).

- **Run one file:** `python3 scripts/build-test.py supabase/tests/NN_name.test.sql` prints a script that creates
  `tests.t_NN_name()` and runs it, ending in `rollback;`. Pass it to Supabase MCP `execute_sql`
  (project `lxhufflxarrwykmvbtna`). `execute_sql` runs the whole call as ONE transaction, so the final `rollback`
  removes the function and everything the test created.
- **Whole suite in one call:** paste every built test's `create function` part plus `supabase/tests/_suite.sql`, then
  `select * from tests.suite(); rollback;` — one row per test file with passed/failed counts.

Nothing a test creates is kept. Tests book about 5 weeks ahead to stay clear of the mock data.

**Pass** = every row starts with `ok` (plus the `1..n` line); any `not ok` row or `# Looks like you failed` is a failure.
