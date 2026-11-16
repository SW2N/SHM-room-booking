"""Print a script that installs a test file as tests.t_<name>() and runs it once (see scripts/run-tests.md).

The test file holds the body of a PL/pgSQL function: `return next <assertion>;` lines,
`perform ...;` / plain statements for setup, ending with `return query select * from finish();`.
A body may start with its own `declare ... begin` section.
The call ends in rollback, so nothing is kept (execute_sql runs the whole call as one transaction).
execute_sql only returns the last result set,
which is why each file is one function.
"""
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
name = "t_" + re.sub(r"[^a-z0-9]+", "_", path.name.split(".")[0].lower())
body = path.read_text(encoding="utf-8")
head = "" if body.lstrip().lower().startswith("declare") else "begin\n"
print(f"create or replace function tests.{name}() returns setof text language plpgsql as $TEST$\n"
      + head + body + f"\nend $TEST$;\nbegin;\nselect * from tests.{name}();\nrollback;")
