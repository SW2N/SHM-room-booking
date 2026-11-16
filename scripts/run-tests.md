# Running the database tests

Test helpers (`tests.make_user`, `tests.act_as`, `tests.act_as_postgres`, `tests.slot`) live permanently in schema
`tests` (migration `20261116000002_test_helpers.sql`, source `supabase/tests/_helpers.sql`). The schema is not exposed
through the API.

Each `supabase/tests/NN_*.test.sql` file is the body of a PL/pgSQL function: `return next <assertion>;` lines and
`perform ...;` setup, ending with `return query select * from finish();`.

`python3 scripts/build-test.py supabase/tests/NN_name.test.sql` prints `begin; create function tests.run() …;
select * from tests.run(); rollback;` — pass that text to the Supabase MCP `execute_sql` tool for project
`lxhufflxarrwykmvbtna`. Nothing a test creates is kept.

**Pass** = every row starts with `ok` (plus the `1..n` plan line); any `not ok` row or a `# Looks like you failed` line is a failure.
