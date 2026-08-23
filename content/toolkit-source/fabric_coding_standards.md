# Fabric Coding Standards — Data Platform Engineering (v2)

Standards for notebooks and Spark code on Microsoft Fabric, with **worked before/after examples**.
Organising principle: *a notebook is a job in a platform, not a script on a laptop.*

**Version tags** appear on every example:

| Tag | Meaning |
|---|---|
| `3.5+` | Works on Runtime 1.3 (Spark 3.5) **and** Runtime 2.0 (Spark 4.x). The safe default. |
| `4.x only` | Requires Runtime 2.0 / Spark 4.x. |
| `differs` | Same intent, different code or behaviour per version — both shown. |

Companions: `spark_internals.html` (the why), `fabric_workload_advisor.py` / `spark_plan_analyzer.py`
(the rules as code), the notebook kit (the rules applied). Finding codes in brackets — e.g. `[L003]`,
`[N002]`, `[S004]` — are what the analyzer reports.

---

## 1. Notebooks are jobs

### 1.1 Parameterize, don't clone `3.5+`

```python
# BAD — one notebook per table; 40 sources means 40 near-identical notebooks
SOURCE_PATH = "abfss://raw@onelake/erp/orders"      # [L010] hard-coded path
TARGET_TABLE = "silver.orders"
```

```python
# GOOD — parameters cell (tagged "parameters"), config resolved from metadata
ENTITY_ID = 1                    # overridden by the pipeline / runMultiple DAG
cfg = CONFIG[ENTITY_ID]          # fetched once per run from Fabric SQL DB, cached
```

Adding source #41 becomes an `INSERT`, not a pull request.

### 1.2 Fail loudly `3.5+`

```python
# BAD — the orchestrator sees success; downstream ingests garbage        [L012]
try:
    df.write.format("delta").mode("overwrite").save(target)
except Exception:
    pass
```

```python
# GOOD — log with context, then re-raise so the activity fails
try:
    df.write.format("delta").mode("overwrite").save(target)
except Exception as ex:
    run_log.append({"entity_id": eid, "status": "FAILED", "error": str(ex)[:2000],
                    "app_id": spark.sparkContext.applicationId})
    write_run_log(run_log)
    raise
```

### 1.3 Session-start vs runtime scope `3.5+`

```python
# BAD — raises AnalysisException [CANNOT_MODIFY_CONFIG] at run time      [L009]
spark.conf.set("spark.executor.memory", "8g")
spark.conf.set("spark.memory.fraction", "0.7")
```

```python
# GOOD — session-start keys go in %%configure (first cell) or the Environment
# %%configure -f
# {"conf": {"spark.executor.memory": "8g", "spark.memory.fraction": "0.7"}}

# Only runtime-mutable keys belong here:
spark.conf.set("spark.sql.shuffle.partitions", "400")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
```

---

### 1.4 Never hard-code workspace or lakehouse GUIDs `3.5+`

```python
# BAD — abfss path pinned to one workspace; breaks the moment the notebook
# is deployed to test or prod via a deployment pipeline               [L013]
df = spark.read.format("delta").load(
    "abfss://8f2c...@onelake.dfs.fabric.microsoft.com/3a71.../Tables/orders")
```

```python
# GOOD — resolve the identifiers Fabric already injects into the session
ws_id = spark.conf.get("trident.workspace.id")
lh_id = spark.conf.get("trident.lakehouse.id")
path  = f"abfss://{ws_id}@onelake.dfs.fabric.microsoft.com/{lh_id}/Tables/orders"
df = spark.read.format("delta").load(path)

# Better still, where the lakehouse is attached to the notebook: skip paths entirely.
df = spark.read.table("orders")
```

Both `trident.*` keys are populated by Fabric at session start. They are absent when running
outside Fabric, so guard them in code that must also run locally:

```python
ws_id = spark.conf.get("trident.workspace.id", None)
if ws_id is None:
    ...  # local/dev fallback — never reached in a Fabric session
```

---

## 2. PySpark performance

### 2.1 UDFs — the most expensive habit `differs`

```python
# BAD — row-at-a-time Python UDF                          [L003] [N002] [P003]
from pyspark.sql.functions import udf
clean = udf(lambda s: s.strip().lower())
df = df.withColumn("status", clean("status"))
```

Costs: opaque to Catalyst, per-row JVM↔Python serialization, breaks whole-stage codegen, and under
NEE **drops the entire enclosing operator to JVM** — one expression poisons the operator.

```python
# GOOD (3.5+) — built-ins: Catalyst-visible, codegen-fused, NEE-native
from pyspark.sql import functions as F
df = df.withColumn("status", F.lower(F.trim("status")))
```

```sql
-- GOOD (4.x only) — shared logic as a SQL UDF: catalog-resident, optimizer-transparent
CREATE FUNCTION clean_status(s STRING) RETURNS STRING RETURN lower(trim(s));
```

If custom logic is genuinely unavoidable, use `@pandas_udf` (Arrow, vectorized — shows as
`ArrowEvalPython` in the plan rather than `BatchEvalPython`).

### 2.2 Driver loops `3.5+`

```python
# BAD — O(n) py4j round trips, zero parallelism                          [L017]
for row in df.collect():
    process(row)
```

```python
# GOOD — express as a join/window so it runs distributed
enriched = df.join(F.broadcast(lookup), "key").withColumn(
    "band", F.when(F.col("amount") > 1000, "high").otherwise("standard"))
```

### 2.3 Driver materialization `3.5+`

```python
# BAD — the #1 driver-OOM cause                                   [L001] [L002]
pdf = df.toPandas()
total = sum(r.amount for r in df.collect())
```

```python
# GOOD — aggregate on executors; collect only the small result
total = df.agg(F.sum("amount")).collect()[0][0]
sample = df.limit(1000).toPandas()      # bounded, deliberate
```

### 2.4 Join key types `3.5+`

```python
# BAD — CAST on the join key kills equi-join detection and stats   [S004] [P008]
j = fact.join(dim, F.col("fact.customer_id").cast("string") == F.col("dim.customer_key"))
```

```python
# GOOD — fix the type once at bronze→silver, then join natively
fact = fact.withColumn("customer_id", F.col("customer_id").cast("int"))   # once, at ingestion
j = fact.join(dim, "customer_id")        # AQE can convert to BroadcastHashJoin at runtime
```

### 2.5 Partition hygiene `3.5+`

```python
# BAD — hard-coded partition counts and a single-task write     [L006] [L007]
df.repartition(2000).write.format("delta").save(path)
df.coalesce(1).write.format("delta").save(path)
```

```python
# GOOD — let AQE size partitions; let Optimize Write size files
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
df.write.format("delta").save(path)      # Optimize Write is a Fabric default
```

### 2.6 Cache discipline `3.5+`

```python
# BAD — cached and never released; competes with execution memory        [L005]
df.cache()
```

```python
# GOOD — cache only what's reused 2+ times, and release it
if reused_multiple_times:
    df.cache()
    ...
    df.unpersist()
```

### 2.7 Explicit schemas `3.5+`

```python
# BAD — an extra full scan, plus type drift between runs                 [L004]
df = spark.read.option("inferSchema", "true").csv(path)
```

```python
# GOOD — schema from metadata (etl_entity), not inline
from pyspark.sql.types import StructType
schema = StructType.fromJson(json.loads(cfg["schema_json"]))
df = spark.read.schema(schema).csv(path)
```

---

## 3. Spark SQL

### 3.1 Parameterization `3.5+`

```python
# BAD — injection risk and a new query text per value            [S001 nearby]
spark.sql(f"SELECT * FROM orders WHERE customer_id = {cust}")
```

```python
# GOOD — bound parameters, stable query text, explicit columns
spark.sql("SELECT order_id, amount FROM orders WHERE customer_id = :cust",
          args={"cust": cust})
```

### 3.2 Latest-record-per-key `3.5+`

```sql
-- BAD — two passes, two shuffles, duplicate rows on ties
SELECT o.* FROM orders o
JOIN (SELECT customer_id, MAX(updated_at) AS mx FROM orders GROUP BY customer_id) m
  ON o.customer_id = m.customer_id AND o.updated_at = m.mx;
```

```sql
-- GOOD — one pass, one shuffle, deterministic
SELECT * FROM (
  SELECT o.*, ROW_NUMBER() OVER (
           PARTITION BY customer_id ORDER BY updated_at DESC, order_id DESC) AS rn
  FROM orders o
) WHERE rn = 1;
```

### 3.3 Exclusion / anti-join `3.5+`

```sql
-- BAD — returns ZERO rows if any blocked.customer_id is NULL             [S002]
SELECT * FROM orders WHERE customer_id NOT IN (SELECT customer_id FROM blocked);
```

```sql
-- GOOD — NULL-safe, and plans as a broadcastable anti-join
SELECT o.* FROM orders o
LEFT ANTI JOIN blocked b ON o.customer_id = b.customer_id;
```

### 3.4 Predicate pushdown `3.5+`

```sql
-- BAD — functions on columns ⇒ PushedFilters: [] and a full scan  [S005] [P006]
SELECT * FROM orders WHERE YEAR(order_date) = 2026 AND UPPER(status) = 'COMPLETE';
```

```sql
-- GOOD — transform the literal, never the column
SELECT order_id, customer_id, amount FROM orders
WHERE order_date >= DATE'2026-01-01' AND order_date < DATE'2027-01-01'
  AND status = 'complete';
```

### 3.5 Error handling under ANSI `differs`

```sql
-- Spark 3.5 (Runtime 1.3): returns NULL silently
SELECT CAST(customer_ref AS INT) FROM staging;
```

```sql
-- Spark 4.x (Runtime 2.0): the SAME statement THROWS — ANSI is on by default
-- Explicit, version-portable form:
SELECT try_cast(customer_ref AS INT) AS customer_id FROM staging;
```

Use `try_cast` / `try_divide` / `try_add` for knowingly-dirty data rather than disabling ANSI
globally — unless you have chosen `native_speed` for NEE reasons, which is a workload-level call.

### 3.6 Multi-step logic `differs`

```python
# Spark 3.5 — control flow lives in Python, SQL is fragmented
for region in regions:
    spark.sql(f"INSERT INTO gold.summary SELECT ... WHERE region = '{region}'")
```

```sql
-- Spark 4.x only — SQL scripting keeps the whole unit reviewable
BEGIN
  FOR row AS SELECT DISTINCT region FROM silver.orders DO
    INSERT INTO gold.summary SELECT * FROM silver.orders WHERE region = row.region;
  END FOR;
END
```

---

## 4. Delta

### 4.1 MERGE hygiene `3.5+`

```python
# BAD — partial key, unfiltered source ⇒ rewrites most of the table
target.alias("t").merge(source.alias("s"), "t.order_id = s.order_id") \
      .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
```

```python
# GOOD — full business key + source pre-filtered to the affected slice
recent = source.where(F.col("order_date") >= last_watermark)
(target.alias("t")
   .merge(recent.alias("s"), "t.order_id = s.order_id AND t.order_date = s.order_date")
   .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute())
```

Check `numTargetFilesAdded` / `numTargetFilesRemoved` in `DESCRIBE HISTORY` to see rewrite
amplification.

### 4.2 Table properties at creation `3.5+`

```sql
-- GOOD — mutation-heavy silver table, configured from day one
CREATE TABLE silver.orders (
  order_id BIGINT, customer_id INT, amount DOUBLE, status STRING, order_date DATE
) USING DELTA
TBLPROPERTIES (
  'delta.enableDeletionVectors' = 'true',   -- MERGE/DELETE mark rows, don't rewrite files
  'delta.enableChangeDataFeed'  = 'true'    -- downstream reads only what changed
);
```

### 4.3 Clustering `differs`

```sql
-- Runtime 1.3 (Delta 3.2) — liquid clustering is preview-gated
SET spark.databricks.delta.clusteredTable.enableClusteringTablePreview = true;
CREATE TABLE silver.orders (...) USING DELTA CLUSTER BY (customer_id, order_date);
```

```sql
-- Runtime 2.0 (Delta 4.2) — standard, no preview flag
CREATE TABLE silver.orders (...) USING DELTA CLUSTER BY (customer_id, order_date);
```

Never partition **and** cluster the same table. Under ~1 TB, partitioning usually hurts; keep it for
retention boundaries only.

### 4.4 Incremental via CDF `3.5+`

```python
# BAD — full rebuild; cost scales with history, not with change
spark.sql("INSERT OVERWRITE gold.daily SELECT order_date, SUM(amount) FROM silver.orders GROUP BY order_date")
```

```python
# GOOD — read only what changed since the last processed version
changes = (spark.read.format("delta")
           .option("readChangeFeed", "true")
           .option("startingVersion", last_version)
           .load(silver_path)
           .where("_change_type != 'update_preimage'"))
# ...aggregate and MERGE into gold; persist the new version in the run log
```

---

### 4.5 Direct Lake serving rules `differs`

Gold tables read by a Direct Lake semantic model have three non-negotiables. All three are
table properties, not session settings, so they survive writers that forget.

```sql
-- GOOD — set once at creation; every subsequent write inherits them
CREATE TABLE gold.fact_sales (...) USING DELTA
CLUSTER BY (order_date, region)                 -- not partitionBy    [L021]
TBLPROPERTIES (
  'delta.parquet.vorder.enabled'        = 'true',   -- Direct Lake transcoding  [L019]
  'delta.enableDeletionVectors'         = 'true',
  'delta.deletedFileRetentionDuration'  = 'interval 7 days'
);
```

```python
# BAD — deletes files a Direct Lake model may still be framed against  [L020]
spark.sql("VACUUM gold.fact_sales RETAIN 24 HOURS")
spark.conf.set("spark.databricks.delta.retentionDurationCheck.enabled", "false")
```

```python
# GOOD — 168 hours (7 days) is the floor, and the guard stays on
spark.sql("VACUUM gold.fact_sales RETAIN 168 HOURS")
```

V-Order is deliberately scoped to **gold only**. It costs write throughput to produce a
read-optimized layout; on bronze/landing tables that nothing serves, it is pure overhead.

---

## 5. Native Execution Engine

### 5.1 Keep the hot path native `3.5+`

```python
# BAD — JSON source + UDF + nested manipulation: three fallback tiers  [N001] [N002] [N005]
df = spark.read.json(raw_path)
df = df.withColumn("clean", my_udf("payload"))
df = df.withColumn("x", F.from_json("payload", schema)).select("x.a.b.c")
```

```python
# GOOD — land once into Delta, keep transforms in built-ins on flat columns
bronze = spark.read.json(raw_path)          # once, at the edge
bronze.write.format("delta").save(bronze_path)
silver = (spark.read.format("delta").load(bronze_path)
          .select(F.lower(F.trim("status")).alias("status"), "amount", "order_date"))
```

### 5.2 The Runtime 2.0 ANSI trap `4.x only`

```python
# RISK — NEE "enabled" but silently inactive: ANSI is on by default on 4.x
#        and NEE falls back under ANSI                                     [N003]
```

```python
# DECIDE deliberately, per workload, at session start:
from fabric_workload_advisor import build_session_conf, render_configure_magic
conf = build_session_conf("fabric-2.0", ansi_strategy="native_speed")  # ansi=false, native speed
# or                       ansi_strategy="ansi_safety"                 # ANSI guards, JVM path
print(render_configure_magic(conf))
```

Verify afterwards: `df.explain()` should show `*Transformer` operators; Spark Advisor raises inline
fallback alerts; `nb_nee_fallback_analyzer` measures the real delta.

---

### 5.3 Size off-heap memory when NEE is on `differs`

NEE runs Velox operators in native C++ **outside the JVM heap**. Those buffers come from Spark's
off-heap pool, which is disabled by default. Turn NEE on without sizing off-heap and the native
engine allocates into whatever the container has left — which surfaces as native allocation
failures rather than a normal Java OOM, and sends people hunting in the wrong place.

```python
# BAD — NEE enabled, off-heap left at its default of disabled/0
# %%configure -f
# {"conf": {"spark.native.enabled": "true"}}
```

```python
# GOOD — reserve ~30% of node memory for native buffers, JVM heap comes down to match
# %%configure -f
# {"conf": {
#     "spark.native.enabled":         "true",
#     "spark.memory.offHeap.enabled": "true",
#     "spark.memory.offHeap.size":    "19g"     # ~30% of a 64 GB Medium node
# }}
```

All three keys are **session-start scope** — the Velox runtime is wired up when the plugin
registry is built, so `spark.conf.set` on a live session does nothing. The 30% figure is a
starting point, not a measured optimum: verify against peak off-heap usage in the Spark UI.
`spark_autoconfig_core.recommend_nee_memory_split()` computes the split for a given node size.

---

## 6. Metadata & orchestration

### 6.1 Fetch once, cache, write twice `3.5+`

```python
# BAD — the metadata store becomes a per-row runtime dependency
for entity in entities:
    cfg = cur.execute("SELECT * FROM etl_entity WHERE entity_id = ?", (entity,)).fetchone()
    ...
    cur.execute("INSERT INTO etl_run_log VALUES (...)")     # one round trip per entity
```

```python
# GOOD — one config read, work from memory, one batched log write
cur.execute("SELECT * FROM vw_active_entities")
CONFIG = {r["entity_id"]: dict(r) for r in cur.fetchall()}
run_rows = []
for eid, cfg in CONFIG.items():
    ...
    run_rows.append((RUN_ID, eid, ...))
cur.executemany("INSERT INTO etl_run_log (...) VALUES (?,?,?,...)", run_rows)
```

### 6.2 Forward-only watermarks `3.5+`

```sql
-- GOOD — concurrent runs can never move the watermark backwards
MERGE dbo.etl_watermark AS t
USING (SELECT ? AS entity_id, ? AS wm) AS s ON t.entity_id = s.entity_id
WHEN MATCHED AND (t.watermark_value IS NULL OR s.wm > t.watermark_value)
  THEN UPDATE SET watermark_value = s.wm, updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (entity_id, watermark_value, updated_at)
  VALUES (s.entity_id, s.wm, SYSUTCDATETIME());
```

### 6.3 One session, not N `3.5+`

```python
# BAD — a pipeline invoking 20 notebooks starts up to 20 Spark sessions
```

```python
# GOOD — one shared session, dependencies expressed as a DAG
dag = {"activities": [
    {"name": "bronze_orders", "path": "nb_ingest_generic", "args": {"entity_id": 1}},
    {"name": "silver_orders", "path": "nb_silver_conform", "args": {"entity_id": 10},
     "dependencies": ["bronze_orders"]}],
    "concurrency": 2}
notebookutils.notebook.runMultiple(dag)
```

---

## 7. Engine choice

```python
# BAD — a multi-node Spark session to move 2 GB
df = spark.read.format("delta").load(small_path)
df.write.format("delta").mode("overwrite").save(target)
```

```python
# GOOD — Python notebook, single node, a fraction of the CU
import polars as pl
from deltalake import write_deltalake
out = (pl.scan_delta(small_path).filter(pl.col("status") == "complete")
         .group_by("region").agg(pl.col("amount").sum()).collect())
write_deltalake(target, out.to_arrow(), mode="overwrite")
```

Two hard overrides: **V-Order gold writes** and **distributed shuffles** require Spark regardless of
size. Encode the decision with `choose_engine()` rather than re-litigating it per task.

---

## 8. Environment, git, deployment

- **Environments own dependencies** — pin libraries there; `%pip install` in production paths is
  session-scoped, slow and unauditable `[L011]`. Re-publish every Environment when moving to
  Runtime 2.0 (Python 3.11 → 3.13) or jobs fail with "No module found".
- **Git integration + deployment pipelines** dev → test → prod; paths resolved from metadata, never
  absolute `abfss://` in code `[L010]`.
- **Naming machines can route on:** `nb_` notebooks, `sjd_` job definitions, `_ops/` operational
  tables, `_quarantine` for DQ rejects.

---

## 9. The kit as the standard applied

| Notebook | Pattern |
|---|---|
| `nb_lakehouse_health_audit` | Observe before acting; platform APIs; versioned report |
| `nb_lakehouse_maintenance` | Metadata-driven destructive ops; dry-run default; post-checked |
| `nb_data_quality` | Rules as data; severity gates; quarantine |
| `nb_ingestion_generic` | One worker, N entities; watermark state; self-proving idempotency |
| `nb_metadata_sqldb_prototype` | Fabric SQL DB schema, connectivity, gotchas, forward-only watermarks |
| `nb_nee_fallback_analyzer` | Measure NEE vs JVM; native coverage per query; ANSI×NEE trade-off |
| `nb_workspace_monitoring` | KQL over the Monitoring Eventhouse; Spark-logs-to-Eventhouse route |

Run `spark_plan_analyzer.review(entry, out, spark, runtime="fabric-2.0")` in a scheduled QA notebook
to enforce most of this automatically — it reports L/N/S/P codes with rewrites and ranks the top
bottlenecks by estimated impact.
