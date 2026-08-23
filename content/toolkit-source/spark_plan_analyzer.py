"""
spark_plan_analyzer.py
=======================
Static + plan-level analysis for Fabric/Spark notebooks.

Three layers, composable:

1. LINT (no Spark needed)      - regex/heuristic scan of notebook code cells for anti-patterns,
                                  with severity, rewrite suggestion, and related Spark settings.
2. PLAN (needs a SparkSession) - extracts `spark.sql(...)` literals and `%%sql` cells, generates
                                  REAL plans via `EXPLAIN FORMATTED` (plans are compiled, never
                                  executed), and inspects plan text for structural issues
                                  (cartesian joins, failed pushdown, Python UDF nodes, shuffle
                                  storms, AQE off...).
3. GRAPH                        - follows notebook dependencies (`%run x`,
                                  `notebookutils.notebook.run("x")`, `runMultiple` DAG paths) and
                                  analyzes the whole tree from an entry notebook, emitting one
                                  combined review report (markdown) with every plan attached.

DataFrame-API chains cannot be planned statically without running the notebook; for those, drop
`PlanRecorder.grab(df, "name")` into the notebook - it captures the formatted plan of any
DataFrame mid-flight and feeds the same analysis. Honest scope note: the lint layer is heuristic
(regex over cells); it aims for high-signal findings, not completeness.
"""

from __future__ import annotations
import json, os, re
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional

# --------------------------------------------------------------------------- findings

@dataclass
class Finding:
    code: str
    severity: str            # info | warn | critical
    where: str               # notebook:cell or plan name
    message: str
    suggestion: str
    settings: List[str] = field(default_factory=list)

SESSION_START_KEYS = re.compile(
    r"spark\.conf\.set\(\s*['\"](spark\.(executor|driver)\.(memory|cores|instances|memoryOverhead)"
    r"|spark\.memory\.(fraction|storageFraction)"
    r"|spark\.dynamicAllocation\.[A-Za-z.]+"
    r"|spark\.native\.enabled"
    r"|spark\.remote\.shuffle\.[A-Za-z.]+"
    r"|spark\.shuffle\.service\.[A-Za-z.]+)['\"]")

# --------------------------------------------------------------------------- layer 1: lint

def lint_source(src: str, where: str) -> List[Finding]:
    f: List[Finding] = []
    add = lambda *a, **k: f.append(Finding(*a, **k))

    if re.search(r"\.toPandas\(\)", src):
        add("L002", "critical", where,
            "toPandas() materializes the full DataFrame on the driver.",
            "Aggregate/limit first, or write to a table and read the summary. For pandas-style code "
            "on big data use pandas API on Spark; for <10 GB use a Python notebook with Polars instead.",
            ["spark.driver.memory (symptom relief only)", "spark.sql.execution.arrow.pyspark.enabled=true"])
    if re.search(r"\.collect\(\)", src) and not re.search(r"\.limit\(\s*\d+\s*\)[^\n]*\.collect\(\)", src):
        add("L001", "warn", where,
            "collect() without a visible limit() - unbounded driver materialization risk (#1 driver-OOM cause).",
            "collect() only aggregated/limited results; keep data on executors otherwise.", [])
    if re.search(r"for\s+\w+\s+in\s+[^\n]*\.collect\(\)", src) or ".iterrows()" in src:
        add("L017", "critical", where,
            "Row-by-row driver loop over collect()/iterrows() - O(n) py4j calls, no parallelism.",
            "Express as joins / window functions / groupBy; if per-row logic is unavoidable, use a "
            "pandas UDF so it runs vectorized on executors.", [])
    if re.search(r"@udf|F?\.?udf\(\s*lambda|udf\(\s*\w+\s*,", src) and "pandas_udf" not in src:
        add("L003", "warn", where,
            "Row-at-a-time Python UDF - opaque to Catalyst, serializes every row across the JVM/Python "
            "boundary, and forces NEE fallback of that operator.",
            "Prefer built-in functions (expr/when/regexp_*/higher-order array funcs); if custom logic is "
            "required, @pandas_udf (Arrow, vectorized). Verify in the plan: BatchEvalPython is the bad "
            "marker, ArrowEvalPython the acceptable one.", [])
    if re.search(r"inferSchema\s*=\s*[Tt]rue|option\(\s*['\"]inferSchema['\"]\s*,\s*['\"]?true", src):
        add("L004", "warn", where,
            "inferSchema triggers an extra full pass over the source and yields drift-prone types.",
            "Define explicit schemas; store them with the entity in the metadata layer (etl_entity).", [])
    ncache = len(re.findall(r"\.(cache|persist)\(", src))
    nunp = len(re.findall(r"\.unpersist\(", src))
    if ncache > nunp:
        add("L005", "info", where,
            f"{ncache} cache/persist vs {nunp} unpersist - cached data competes with execution memory "
            "and accelerates spill.",
            "Cache only DataFrames reused 2+ times; unpersist when done; check the Storage tab.", 
            ["spark.memory.storageFraction (do not raise blindly)"])
    if re.search(r"\.coalesce\(\s*1\s*\)", src):
        add("L006", "warn", where,
            "coalesce(1) funnels the entire write through one task - single-core bottleneck and one "
            "giant output file.",
            "Let Optimize Write handle file sizing; if one file is truly required, do it as a cheap "
            "post-step on the small result, not on the wide transform.", [])
    m = re.search(r"\.repartition\(\s*(\d{4,})", src)
    if m:
        add("L007", "warn", where,
            f"Hard-coded repartition({m.group(1)}) - thousands of tasks regardless of data size.",
            "Remove and let AQE coalescing size partitions from runtime stats; set advisory size instead.",
            ["spark.sql.adaptive.advisoryPartitionSizeInBytes=128m"])
    if ".crossJoin(" in src:
        add("L008", "critical", where,
            "Explicit cross join - output rows = |left| x |right|.",
            "Almost always a missing join key; if intentional (e.g. date spine), filter both sides "
            "to the minimum first.", [])
    if SESSION_START_KEYS.search(src):
        add("L009", "critical", where,
            "spark.conf.set() on a SESSION-START scoped key - raises CANNOT_MODIFY_CONFIG at runtime "
            "(verified empirically; see Sec 13 of the internals doc).",
            "Move to %%configure -f at the top of the notebook, or the Environment's Spark properties.", [])
    if re.search(r"abfss://[^\s'\"]+", src):
        add("L010", "info", where,
            "Hard-coded abfss:// path in code.",
            "Resolve paths from the metadata layer (etl_entity) or use Lakehouse-relative paths - "
            "hard-coded storage URIs break across dev/test/prod deployment pipelines.", [])
    if re.search(r"%pip\s+install|!pip\s+install", src):
        add("L011", "warn", where,
            "%pip install at run time - session-scoped, slow session starts, unauditable versions.",
            "Pin the library in the Environment and publish; reserve %pip for exploration only.", [])
    if re.search(r"except\s*(Exception)?\s*:\s*\n?\s*pass", src):
        add("L012", "critical", where,
            "except: pass swallows failures - the orchestrator sees success, downstream layers ingest garbage.",
            "Catch specifically, log to the run log, and re-raise (or mark the run FAILED).", [])
    if re.search(r"\.dropDuplicates\(\s*\)", src):
        add("L015", "info", where,
            "dropDuplicates() with no subset - full-row comparison across every column, wide shuffle.",
            "Deduplicate on the business key subset; for 'latest record wins', a window over the key "
            "ordered by timestamp is cheaper and explicit.", [])
    if re.search(r"broadcast\(\s*\w+\s*\)", src) and not re.search(r"\.(filter|where|limit)\(", src):
        add("P012", "warn", where,
            "broadcast(df) without visible filter/limit - risks Driver OOM during TorrentBroadcast collection.",
            "Verify the broadcasted side is <100 MB post-filter; uncompressed in-memory size is 3-5x disk Parquet size.",
            ["spark.sql.autoBroadcastJoinThreshold", "spark.driver.memory"])
    if re.search(r"(create\s+(or\s+replace\s+)?materialized\s+view|materialized_lake_view)", src, re.I) and re.search(r"(row_number|rank|dense_rank|lead|lag)\s*\(\s*\)\s*over", src, re.I):
        add("M001", "critical", where,
            "Window function inside Materialized Lake View (MLV) - definitively blocks incremental refresh.",
            "Fabric silently falls back to full refresh for views with window functions. Rewrite dedup using aggregation (max_by) or use a hand-rolled CDF incremental pipeline (Sec 38).", [])
    if re.search(r"\.write\s*\(|\.write\.format\(\s*['\"]delta['\"]\s*\)", src) and "partitionBy" in src and "clusterBy" not in src and "optimizeWrite" not in src:
        add("L018", "warn", where,
            "Delta write with Hive-style partitionBy without Optimize Write - risks generating thousands of tiny files.",
            "Use Liquid Clustering (CLUSTER BY) instead of partitioning under 1 TB, or enable Optimize Write to prevent Direct Lake performance degradation.",
            ["spark.microsoft.delta.optimizeWrite.enabled=true", "spark.microsoft.delta.adaptiveTargetFileSize.enabled=true"])

    # ---- L019: gold/silver Delta write without V-Order -------------------------------------
    # V-Order is a write-time Parquet optimization that Direct Lake semantic models depend on.
    # Only flag layers where it pays for itself: gold (BI serving) and, more weakly, silver.
    # Bronze writes should NOT be flagged - V-Order costs write throughput for no read benefit.
    if re.search(r"\.write|\bsaveAsTable\b|\bINSERT\s+INTO\b", src, re.I) and \
       re.search(r"\b(gold|silver)[._/]", src, re.I) and \
       not re.search(r"vorder|v_order", src, re.I):
        add("L019", "warn", where,
            "Delta write to a gold/silver table with no V-Order signal in the notebook - Direct Lake "
            "semantic models read these files and benefit from V-Order's sorted/encoded layout.",
            "Set V-Order for the write, or (preferred) set it as a table property so it survives "
            "writers that forget. Note V-Order costs write time and is NOT worth it on bronze/landing "
            "tables that are never served to BI.",
            ["spark.sql.parquet.vorder.default=true", "delta.parquet.vorder.enabled=true"])

    # ---- L020: unsafe VACUUM ---------------------------------------------------------------
    # Two distinct failure modes: an explicit sub-168h retention, and disabling the safety check.
    m_vac = re.search(r"VACUUM\s+[^\n;]*?RETAIN\s+(\d+(?:\.\d+)?)\s+HOURS", src, re.I)
    if m_vac and float(m_vac.group(1)) < 168:
        add("L020", "critical", where,
            f"VACUUM with RETAIN {m_vac.group(1)} HOURS - below the 168-hour (7-day) floor. This can "
            "delete files still referenced by in-flight readers, by time travel, and by Direct Lake "
            "semantic models that have not re-framed.",
            "Keep retention at 168 hours or more. If a shorter window is genuinely required, confirm "
            "no concurrent readers and no Direct Lake dependency first, and treat it as a one-off "
            "rebaseline rather than a scheduled job.",
            ["delta.deletedFileRetentionDuration"])
    if re.search(r"retentionDurationCheck\.enabled\s*['\"]?\s*,\s*['\"]?false", src, re.I) or \
       re.search(r"retentionDurationCheck\.enabled['\"]?\s*=\s*['\"]?false", src, re.I):
        add("L020", "critical", where,
            "spark.databricks.delta.retentionDurationCheck.enabled set to false - the guard that stops "
            "a sub-7-day VACUUM has been switched off.",
            "Remove the override. It exists to prevent data loss, and disabling it in a scheduled "
            "notebook makes that loss recurring rather than accidental.",
            ["spark.databricks.delta.retentionDurationCheck.enabled"])

    # ---- L021: high-cardinality partitionBy -------------------------------------------------
    m_part = re.search(r"partitionBy\(\s*([^)]*)\)", src)
    if m_part and re.search(r"timestamp|datetime|_ts\b|_at\b|\bday\b|\bhour\b|\bid\b|guid|uuid",
                            m_part.group(1), re.I):
        add("L021", "warn", where,
            f"partitionBy({m_part.group(1).strip()[:60]}) looks high-cardinality - Hive-style partitioning "
            "on a timestamp/id column produces many small directories and cripples file pruning.",
            "Use Liquid Clustering (CLUSTER BY) instead, which adapts to the data without fixing a "
            "directory layout. Reserve partitionBy for low-cardinality columns with a stable domain "
            "(region, tenant) on tables large enough to justify it.",
            ["delta.liquid.clustering", "spark.microsoft.delta.optimizeWrite.enabled=true"])
    return f

# --------------------------------------------------------------------------- notebook parsing

MAGIC_SQL = re.compile(r"^\s*%%sql\s*\n(.*)", re.S)
SQL_LIT = re.compile(r"spark\.sql\(\s*(?:f?)(\"\"\"|'''|\"|')(.*?)\1", re.S)
DEP_PATTERNS = [
    re.compile(r"%run\s+([\w./-]+)"),
    re.compile(r"(?:notebookutils|mssparkutils)\.notebook\.run\(\s*['\"]([^'\"]+)"),
    re.compile(r"['\"]path['\"]\s*:\s*['\"]([^'\"]+)"),   # runMultiple DAG activities
]

def read_cells(path: str) -> List[str]:
    if path.endswith(".ipynb"):
        nb = json.load(open(path))
        return ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]
    return [open(path).read()]

def extract_sql(cells: List[str]) -> List[Dict]:
    out = []
    for i, src in enumerate(cells):
        mm = MAGIC_SQL.match(src)
        if mm:
            out.append({"cell": i, "sql": mm.group(1).strip(), "kind": "%%sql"})
            continue
        for m in SQL_LIT.finditer(src):
            sql = m.group(2).strip()
            is_fstring = bool(re.search(r"spark\.sql\(\s*f", src[max(0, m.start()-12):m.start()+12]))
            out.append({"cell": i, "sql": sql, "kind": "literal",
                        "parameterized": is_fstring and "{" in sql})
    return out

def extract_deps(cells: List[str]) -> List[str]:
    deps = []
    for src in cells:
        for pat in DEP_PATTERNS:
            deps += pat.findall(src)
    return sorted({d for d in deps})

# --------------------------------------------------------------------------- layer 2: plan analysis

def explain_sql(spark, sql: str, mode: str = "FORMATTED") -> str:
    """EXPLAIN compiles the full Catalyst pipeline (parse->analyze->optimize->physical plan)
    against the live catalog WITHOUT executing anything - free and safe."""
    return spark.sql(f"EXPLAIN {mode} {sql}").collect()[0][0]

def analyze_plan_text(plan: str, where: str) -> List[Finding]:
    f: List[Finding] = []
    add = lambda *a, **k: f.append(Finding(*a, **k))
    if "CartesianProduct" in plan:
        add("P001", "critical", where, "CartesianProduct in the plan - no join condition survived optimization.",
            "Check the ON clause: mismatched types or a condition wrapped in a UDF prevents equi-join "
            "detection. Fix the predicate; never 'fix' by raising spark.sql.crossJoin.enabled.", [])
    if "BroadcastNestedLoopJoin" in plan:
        add("P002", "critical", where, "BroadcastNestedLoopJoin - non-equi or missing join keys with a "
            "broadcastable side; every left row scans the whole broadcast.",
            "Rewrite range/inequality joins: bucketize the range into join keys, or pre-filter hard.", [])
    if "BatchEvalPython" in plan:
        add("P003", "critical", where, "BatchEvalPython node - row-at-a-time Python UDF inside the plan "
            "(breaks codegen fusion, forces NEE fallback, serializes every row).",
            "Replace with built-ins, or at minimum @pandas_udf (shows as ArrowEvalPython).", [])
    elif "ArrowEvalPython" in plan:
        add("P004", "info", where, "ArrowEvalPython - vectorized pandas UDF. Acceptable, still invisible "
            "to Catalyst and not NEE-offloadable.",
            "Prefer built-ins where expressible.", [])
    # ---- P015: NEE columnar/row transition churn -------------------------------------------
    # Velox runs columnar; the JVM runs row-at-a-time. Every fallback inserts a conversion.
    # A couple of boundaries is normal (scan in, result out). Many means the plan is
    # ping-ponging between engines and paying conversion cost repeatedly.
    n_c2r = plan.count("ColumnarToRow") + plan.count("VeloxColumnarToRowExec")
    n_r2c = plan.count("RowToColumnar") + plan.count("RowToVeloxColumnar")
    n_conv = n_c2r + n_r2c
    if n_conv >= 4:
        add("P015", "warn", where,
            f"{n_conv} columnar/row conversion boundaries ({n_c2r} ColumnarToRow, {n_r2c} RowToColumnar) - "
            "the plan is repeatedly crossing between Velox native and JVM execution. Each crossing "
            "materializes and re-encodes the batch, and the conversion cost can exceed the native speedup.",
            "Find the unsupported operator forcing each fallback (Fabric Monitoring -> 'NEE fallback "
            "detected' -> View root cause names it). Usual culprits: row-at-a-time Python UDFs, "
            "JSON/XML sources, streaming operators, and ANSI-mode expressions. Removing one bad "
            "operator often collapses several conversion boundaries at once.",
            ["spark.native.enabled", "spark.sql.ansi.enabled"])
    elif n_conv > 0 and ("BatchEvalPython" in plan):
        add("P015", "info", where,
            f"{n_conv} columnar/row conversion boundary(ies) alongside a row-at-a-time Python UDF - "
            "the UDF is the likely fallback trigger.",
            "Convert the UDF to @pandas_udf or a built-in; NEE can offload far more of the plan once "
            "BatchEvalPython is gone.",
            ["spark.native.enabled"])
    n_ex = plan.count("Exchange")
    if n_ex >= 5:
        add("P005", "warn", where, f"{n_ex} Exchange (shuffle) operators in one query.",
            "Look for repeated re-aggregation of the same grain, joins that could share partitioning "
            "(bucketing/Storage Partition Join), or a missing intermediate table for reused subresults.",
            ["spark.sql.adaptive.advisoryPartitionSizeInBytes"])
    if re.search(r"PushedFilters:\s*\[\]", plan) and re.search(r"\bFilter\b", plan):
        add("P006", "warn", where, "Filter present but PushedFilters is empty - predicate pushdown failed; "
            "the scan reads everything and filters in Spark.",
            "Common causes: filter on a UDF/cast-wrapped column, or non-deterministic expression. "
            "Filter on the raw column; cast the literal, not the column.", [])
    if re.search(r"PartitionFilters:\s*\[\](?![^\n]*PartitionCount: 1\b)", plan) and "PartitionCount" in plan:
        add("P007", "warn", where, "Partitioned source scanned with empty PartitionFilters - full-table scan.",
            "Filter on the partition/cluster column with a literal (no functions on the column side).", [])
    if "SortMergeJoin" in plan and "BroadcastHashJoin" not in plan:
        add("P008", "info", where, "SortMergeJoin chosen - correct for two large sides, wasteful if one "
            "side is small.",
            "If a side is < ~100 MB post-filter, hint broadcast(df) or let AQE convert (verify the "
            "final plan, isFinalPlan=true, shows BroadcastHashJoin).",
            ["spark.sql.autoBroadcastJoinThreshold", "spark.sql.adaptive.autoBroadcastJoinThreshold"])
    if "AdaptiveSparkPlan" not in plan:
        add("P009", "warn", where, "No AdaptiveSparkPlan wrapper - AQE is disabled for this query.",
            "Re-enable it: AQE is the safety net for partition sizing, join conversion and skew.",
            ["spark.sql.adaptive.enabled=true"])
    m = re.search(r"hashpartitioning\([^)]*,\s*200\)", plan)
    if m:
        add("P010", "info", where, "Exchange at the default 200 shuffle partitions.",
            "Fine with AQE coalescing on; otherwise size explicitly (~total shuffle bytes / 128MB).",
            ["spark.sql.shuffle.partitions", "spark.sql.adaptive.coalescePartitions.enabled=true"])
    m = re.search(r"ReadSchema:[^\n]*struct<([^>]*)>", plan)
    if m and m.group(1).count(",") + 1 > 30:
        add("P011", "info", where, f"Scan reads {m.group(1).count(',') + 1} columns.",
            "Select only needed columns as early as possible so column pruning reaches the scan.", [])
    return f


# --------------------------------------------------------------------------- NEE fallback (N-codes)

NON_NATIVE_FORMATS = ("json", "xml", "avro", "orc", "text")

def lint_nee(src: str, where: str, runtime: str = "fabric-1.3") -> List[Finding]:
    """Static prediction of Native Execution Engine fallback triggers.
    NOTE: the authoritative operator/expression support list lives in the Apache Gluten docs and
    moves release to release - these are the durable, documented trigger CLASSES, not a frozen
    support matrix. Always confirm with df.explain() / Spark Advisor / the Diagnostics pane."""
    f: List[Finding] = []
    add = lambda *a, **k: f.append(Finding(*a, **k))
    for fmt in NON_NATIVE_FORMATS:
        if re.search(rf"format\(\s*['\"]{fmt}['\"]|\.{fmt}\(", src):
            add("N001", "warn", where,
                f"Reads/writes {fmt.upper()} - NEE processes Parquet and Delta natively; other formats "
                f"force conversion that erases the acceleration.",
                f"Land {fmt.upper()} into Delta once at bronze, then keep the hot path on Delta/Parquet. "
                f"(Vectorized CSV parsing was added for NEE; JSON/XML remain fallback paths.)", [])
            break
    if re.search(r"@udf|F?\.?udf\(\s*lambda|udf\(\s*\w+\s*,", src):
        add("N002", "critical", where,
            "Python UDF in the plan - a single unsupported expression drops its whole enclosing "
            "operator to JVM execution, adding columnar-to-row conversion at the boundary.",
            "Replace with built-ins where possible. NEE on Runtime 2.0 added Python/Scala UDF support, "
            "but built-ins remain the only way to keep the operator fully native AND Catalyst-visible.",
            ["spark.native.enabled"])
    if re.search(r"readStream|writeStream", src):
        add("N004", "warn", where,
            "Structured Streaming under NEE - streaming plans fall back to JVM Spark today.",
            "Expect no NEE acceleration for this workload; size compute on JVM performance and "
            "consider keeping NEE enabled anyway for the batch jobs in the same environment.", [])
    if re.search(r"explode\(|posexplode\(|from_json\(|to_json\(|\.getField\(|struct\(", src):
        add("N005", "info", where,
            "Nested/complex type manipulation - deeply nested struct/map operations are a common "
            "fallback trigger.",
            "Flatten to columnar operations where the logic allows; do the nesting once at the edge "
            "rather than repeatedly in the hot path.", [])
    if runtime == "fabric-2.0" and not re.search(r"ansi\.enabled['\"]\s*[,:]\s*['\"]false", src):
        add("N003", "warn", where,
            "Runtime 2.0 defaults ANSI mode ON, and NEE falls back under ANSI - so NEE may be silently "
            "inactive for much of this notebook.",
            "Decide per workload: ansi_strategy='native_speed' (ansi=false, regain native offload) or "
            "'ansi_safety' (keep ANSI guards, accept JVM path). Measure both with nb_nee_fallback_analyzer.",
            ["spark.sql.ansi.enabled", "spark.native.enabled"])
    return f

def analyze_plan_nee(plan: str, where: str) -> List[Finding]:
    """Plan-level NEE analysis: native coverage and conversion-boundary cost."""
    f: List[Finding] = []
    native = len(re.findall(r"Transformer|NativeFileScan", plan))
    conv = len(re.findall(r"VeloxColumnarToRowExec|RowToVeloxColumnar", plan))
    if native == 0 and conv == 0:
        return f  # NEE not enabled for this plan - nothing to say
    if native == 0 and conv > 0:
        f.append(Finding("N007", "critical", where,
            "NEE enabled but ZERO native operators in the plan - you are paying conversion overhead "
            "for no native execution.",
            "Find the trigger (source format, ANSI, UDF, streaming) or disable NEE for this job: "
            "a fully-fallen-back plan can be slower than NEE-off.", ["spark.native.enabled"]))
    elif conv >= max(2, native // 2):
        f.append(Finding("N006", "warn", where,
            f"High conversion-boundary count ({conv} conversions vs {native} native operators) - the "
            "plan alternates between native and JVM execution.",
            "Fallback in the MIDDLE of a plan is the expensive case. Remove the interleaved trigger "
            "(usually a UDF or unsupported expression) so native execution runs in longer stretches.", []))
    else:
        f.append(Finding("N008", "info", where,
            f"Native coverage looks healthy ({native} native operators, {conv} conversion boundaries).",
            "No action - verify against Spark Advisor's inline fallback alerts as the query evolves.", []))
    return f

# --------------------------------------------------------------------------- SQL text lint (S-codes)

def lint_sql(sql: str, where: str) -> List[Finding]:
    f: List[Finding] = []
    add = lambda *a, **k: f.append(Finding(*a, **k))
    s = re.sub(r"--[^\n]*", " ", sql)
    s_low = s.lower()
    if re.search(r"select\s+\*", s_low) and "limit" not in s_low:
        add("S001", "warn", where, "SELECT * - blocks column pruning; the scan reads every column.",
            "Project only the columns you need so pruning reaches the FileScan (ReadSchema shrinks).", [])
    if re.search(r"\bnot\s+in\s*\(", s_low):
        add("S002", "critical", where,
            "NOT IN with a subquery - if any returned value is NULL the predicate yields no rows "
            "(three-valued logic), and it plans as a slow anti-join.",
            "Use NOT EXISTS or a LEFT ANTI JOIN - correct with NULLs and better-optimized.", [])
    if re.search(r"\bfrom\b[^;]*,[^;]*\bwhere\b", s_low) and " join " not in s_low:
        add("S003", "warn", where, "Comma-separated FROM with WHERE-clause join predicates (implicit join).",
            "Use explicit JOIN ... ON: a missed predicate silently becomes a cross join.", [])
    if re.search(r"on\s+\w*\s*\(?\s*(cast|upper|lower|trim|substr|coalesce|date_format)\s*\(", s_low):
        add("S004", "critical", where,
            "Function/CAST wrapping a JOIN key - kills equi-join detection and statistics; often "
            "degrades to SortMergeJoin or worse.",
            "Fix the schema so keys match natively, or materialize the derived key as a column once.", [])
    if re.search(r"where[^;]*\b(cast|upper|lower|substr|year|date_format)\s*\(\s*\w+\s*\)?\s*(=|>|<)", s_low):
        add("S005", "warn", where,
            "Function applied to a COLUMN in a WHERE predicate - blocks predicate/partition pushdown "
            "(PushedFilters comes back empty).",
            "Transform the literal instead of the column: `order_date >= DATE'2026-01-01'` rather than "
            "`year(order_date) = 2026`.", [])
    if "distinct" in s_low and re.search(r"group\s+by", s_low):
        add("S006", "info", where, "DISTINCT together with GROUP BY - usually redundant, adds a shuffle.",
            "GROUP BY already deduplicates the grouping keys; drop the DISTINCT.", [])
    if re.search(r"order\s+by", s_low) and "limit" not in s_low and s_low.strip().startswith("select"):
        add("S007", "warn", where,
            "ORDER BY without LIMIT - forces a full global sort (single-partition range exchange).",
            "Add LIMIT, or sort downstream in the consuming tool; ordering rarely belongs in an ETL write.", [])
    if re.search(r"row_number\(\)\s*over", s_low) and "qualify" not in s_low and "where" not in s_low:
        add("S008", "info", where, "ROW_NUMBER() window without an outer filter - computes ranks it may discard.",
            "Filter the rank in an outer query (rn = 1) so Spark can prune early.", [])
    return f

# --------------------------------------------------------------------------- bottleneck ranking

IMPACT_WEIGHTS = {   # HEURISTIC weights - tune to your estate, not laws of physics
    "N007": 95, "P001": 95, "M001": 92, "P002": 90, "L017": 88, "L002": 85, "P012": 82, "N002": 80, "P003": 80,
    "S004": 78, "P006": 75, "S002": 72, "N006": 70, "P007": 70, "L009": 68, "L012": 65,
    "L018": 60, "P005": 60, "L008": 60, "S005": 58, "L001": 55, "N003": 55, "P009": 52, "S007": 48,
    "L006": 45, "N001": 45, "S001": 42, "L007": 40, "P008": 35, "L004": 35, "N004": 32,
    "S003": 30, "L011": 28, "L005": 25, "N005": 25, "L015": 22, "P010": 20, "S006": 18,
    "L010": 18, "S008": 15, "P011": 15, "P004": 10, "N008": 0, "G001": 5,
    "L020": 94, "P015": 72, "L021": 58, "L019": 44,
}
SEV_MULT = {"critical": 1.0, "warn": 0.6, "info": 0.25}

def rank_bottlenecks(findings: List[Finding], top: int = 5) -> List[Dict]:
    scored = []
    for f in findings:
        base = IMPACT_WEIGHTS.get(f.code, 30)
        scored.append({"score": round(base * SEV_MULT.get(f.severity, 0.5), 1), "finding": f})
    scored.sort(key=lambda x: -x["score"])
    return [s for s in scored[:top] if s["score"] > 0]

def nee_coverage(reports: List[Dict]) -> Optional[Dict]:
    native = conv = 0
    for r in reports:
        for s in r.get("sqls", []):
            p = s.get("plan") or ""
            native += len(re.findall(r"Transformer|NativeFileScan", p))
            conv += len(re.findall(r"VeloxColumnarToRowExec|RowToVeloxColumnar", p))
    if native == 0 and conv == 0:
        return None
    total = native + conv
    return {"native_ops": native, "conversions": conv,
            "coverage_pct": round(100.0 * native / total, 1) if total else 0.0}

# --------------------------------------------------------------------------- recorder + reports

class PlanRecorder:
    """Drop into a notebook to capture DataFrame plans mid-flight:
         rec = PlanRecorder("/lakehouse/default/Files/plans")
         rec.grab(df_silver, "silver_conform")
       Each grab writes the formatted plan + findings; rec.report() emits the combined review."""
    def __init__(self, out_dir: str):
        self.out_dir = out_dir
        os.makedirs(out_dir, exist_ok=True)
        self.entries: List[Dict] = []

    def grab(self, df, name: str) -> List[Finding]:
        plan = df._jdf.queryExecution().explainString(
            df._sc._jvm.org.apache.spark.sql.execution.ExplainMode.fromString("formatted"))
        findings = analyze_plan_text(plan, f"plan:{name}")
        open(os.path.join(self.out_dir, f"{name}.plan.txt"), "w").write(plan)
        self.entries.append({"name": name, "plan": plan, "findings": findings})
        return findings

    def report(self) -> str:
        path = os.path.join(self.out_dir, "plan_review.md")
        open(path, "w").write(render_report(
            [{"notebook": e["name"], "findings": e["findings"],
              "sqls": [{"sql": "(DataFrame plan)", "plan": e["plan"], "plan_findings": []}]}
             for e in self.entries]))
        return path

def analyze_notebook(path: str, spark=None, runtime: str = "fabric-1.3") -> Dict:
    cells = read_cells(path)
    name = os.path.basename(path)
    findings: List[Finding] = []
    for i, src in enumerate(cells):
        findings += lint_source(src, f"{name}:cell{i}")
        findings += lint_nee(src, f"{name}:cell{i}", runtime)
    sqls = extract_sql(cells)
    for s in sqls:
        findings += lint_sql(s["sql"], f"{name}:cell{s['cell']}:sql")
        if s.get("parameterized"):
            s["plan"] = None
            s["note"] = "f-string SQL - resolve parameters, then EXPLAIN manually"
            continue
        if spark is not None:
            try:
                s["plan"] = explain_sql(spark, s["sql"])
                s["plan_findings"] = (analyze_plan_text(s["plan"], f"{name}:cell{s['cell']}:sql")
                                       + analyze_plan_nee(s["plan"], f"{name}:cell{s['cell']}:sql"))
                findings += s["plan_findings"]
            except Exception as ex:
                s["plan"] = None
                s["note"] = f"EXPLAIN failed: {str(ex)[:160]}"
    return {"notebook": name, "path": path, "findings": findings,
            "sqls": sqls, "deps": extract_deps(cells)}

def analyze_tree(entry_path: str, spark=None, search_dirs: Optional[List[str]] = None,
                  runtime: str = "fabric-1.3") -> List[Dict]:
    """Entry notebook + every dependency reachable via %run / notebook.run / runMultiple paths."""
    search_dirs = search_dirs or [os.path.dirname(os.path.abspath(entry_path))]
    def resolve(dep: str) -> Optional[str]:
        cand = [dep, dep + ".ipynb", dep + ".py"]
        for d in search_dirs:
            for c in cand:
                p = os.path.join(d, os.path.basename(c))
                if os.path.isfile(p):
                    return p
        return None
    seen, order, queue = set(), [], [entry_path]
    while queue:
        p = queue.pop(0)
        if p in seen: continue
        seen.add(p)
        rep = analyze_notebook(p, spark, runtime)
        order.append(rep)
        for d in rep["deps"]:
            rp = resolve(d)
            if rp and rp not in seen:
                queue.append(rp)
            elif not rp:
                rep["findings"].append(Finding("G001", "info", rep["notebook"],
                    f"Dependency '{d}' referenced but not found in search dirs.",
                    "Pass search_dirs covering all notebook folders for full-tree analysis.", []))
    return order

SEV_ICON = {"critical": "[CRITICAL]", "warn": "[WARN]", "info": "[info]"}

def render_report(reports: List[Dict]) -> str:
    lines = ["# Spark Plan & Practice Review", ""]
    total = {"critical": 0, "warn": 0, "info": 0}
    for r in reports:
        for f in r["findings"]:
            total[f.severity] += 1
    lines.append(f"**{len(reports)} notebook(s) analyzed - "
                 f"{total['critical']} critical, {total['warn']} warnings, {total['info']} informational.**\n")
    allf = [f for r in reports for f in r["findings"]]
    top = rank_bottlenecks(allf)
    if top:
        lines.append("\n## Fix these first (ranked by estimated impact)\n")
        for i, t in enumerate(top, 1):
            f = t["finding"]
            lines.append(f"{i}. **{f.code}** (score {t['score']}) - {f.where}: {f.message}")
            lines.append(f"   - *Fix:* {f.suggestion}")
        lines.append("\n_Impact scores are heuristic weights x severity - a triage aid, not a measurement._")
    cov = nee_coverage(reports)
    if cov:
        lines.append(f"\n**NEE native coverage:** {cov['coverage_pct']}% "
                     f"({cov['native_ops']} native operators, {cov['conversions']} conversion boundaries). "
                     f"Confirm against Spark Advisor's inline alerts and the Diagnostics pane.")
    for r in reports:
        lines.append(f"\n## {r['notebook']}")
        if r.get("deps"):
            lines.append(f"Dependencies: {', '.join(r['deps'])}")
        if not r["findings"]:
            lines.append("\nNo findings.")
        for f in r["findings"]:
            lines.append(f"\n### {SEV_ICON[f.severity]} {f.code} - {f.where}")
            lines.append(f"{f.message}")
            lines.append(f"\n**Rewrite/fix:** {f.suggestion}")
            if f.settings:
                lines.append(f"\n**Related settings:** `" + "`, `".join(f.settings) + "`")
        for s in r.get("sqls", []):
            if s.get("plan"):
                lines.append(f"\n<details><summary>Plan - {r['notebook']} cell {s['cell']}</summary>\n")
                lines.append("```\n" + s["plan"].strip() + "\n```\n</details>")
            elif s.get("note"):
                lines.append(f"\n_SQL in cell {s['cell']}: {s['note']}_")
    return "\n".join(lines)

def review(entry_path: str, out_path: str, spark=None, search_dirs=None,
           runtime: str = "fabric-1.3") -> str:
    reports = analyze_tree(entry_path, spark, search_dirs, runtime)
    open(out_path, "w").write(render_report(reports))
    return out_path
