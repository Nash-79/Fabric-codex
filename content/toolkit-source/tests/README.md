# Tests

Unit and end-to-end tests for the toolkit's Python utilities. Note the suites are mixed style: `test_enhanced_rules.py` is `unittest`-based, the others are plain `assert` scripts with a `__main__` block, so `unittest discover` will NOT collect them all — run them individually, or use `pytest`, which collects every file. Run from the folder containing the
modules (`spark_autoconfig_core.py`, `fabric_workload_advisor.py`, `spark_plan_analyzer.py`):

```bash
python3 tests/test_workload_advisor.py    # capacity math, engine choice, spill risk, table props
python3 tests/test_spark_autoconfig.py    # tuning heuristics (no Spark required)
python3 tests/test_enhanced_rules.py      # unittest: enhanced lint/plan rules
python3 tests/test_e2e.py                 # end-to-end against a local Spark session (needs pyspark)
python3 tests/probe_mutability.py         # empirically re-derive which Spark configs are
                                          # runtime-mutable vs session-start on YOUR runtime
```

`probe_mutability.py` is the interesting one operationally: run it inside Fabric on Runtime 1.3 and
2.0 to confirm the runtime/session-start scope split for your exact build, rather than trusting the
table in the docs.
