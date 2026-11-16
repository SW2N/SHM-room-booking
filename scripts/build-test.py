"""Print a runnable test script (see scripts/run-tests.md).

The test file holds the body of a PL/pgSQL function: `return next <assertion>;` lines,
`perform ...;` / plain statements for setup, ending with `return query select * from finish();`.
It is wrapped as tests.run(), called once (execute_sql only returns the last result set),
inside begin; ... rollback; so nothing is kept.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
body = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
print("begin;\ncreate or replace function tests.run() returns setof text language plpgsql as $TEST$\nbegin\n"
      + body + "\nend $TEST$;\nselect * from tests.run();\nrollback;")
