# Fabric Spark Toolkit — File Index

## How to use
Unzip **everything into ONE folder**, then open `index.html`. Links are relative, so files
downloaded individually into different locations will not resolve.
Notebooks open as **rendered previews** (`nbhtml/*.html`) because browsers cannot display raw
`.ipynb` files; each card also offers the `.ipynb` itself as a download.

## Start here
- **docs.html** — rendered, syntax-highlighted viewer for all markdown docs (standards, plan, analyzer sample, index).
- **index.html** — toolkit hub: one page linking every asset with deep links into the internals doc.

## Interactive reference
- **fabric_deepdives.html** — Seven deep dives: Spark views/UDF types (fact-checked), NEE do-and-don't, Fabric SQL DB from notebooks (stored procs/views/JDBC), User Data Functions, dbt on Lakehouse + Warehouse with MLV, Fabric Data Agents & governed NL2Ontology, and Fabric IQ enterprise knowledge graphs.
- **spark_internals.html** — 48-section interactive Spark internals + Fabric platform reference. E2E architecture map, runtime selector (1.3/2.0), Feature Explorer, config reference & advisors, capacity planner, troubleshooting trees, annotated plan explorer.
- **efficient_scaledown.html** — Standalone interactive deep-dive whitepaper on Efficient Scaledown & Remote Shuffle Manager with SVG diagrams and decision matrices.

## Utilities (Python modules — unit-tested)
- **spark_autoconfig_core.py / spark_autoconfig.py** — Spark tuning heuristics + session wrapper (runtime vs session-start scope split, verified empirically).
- **fabric_workload_advisor.py** — capacity/CU planning, admission checks, engine choice (Python vs Spark), spill risk, table properties, runtime profiles (1.3/2.0).
- **spark_eventlog_analyzer.py** — URL normaliser + real event log parser (skew, spill, critical path, effective config).
- **spark_plan_analyzer.py** — notebook linter + dependency-tree walker + EXPLAIN-based plan generator & issue detector; emits markdown reviews (see plan_review_demo.md).

## Notebooks (all executed end-to-end on the Runtime 1.3 stack)
- **spark_auto_config_utility.ipynb** — auto-configure a session from data + cluster.
- **fabric_best_practices.ipynb** — runtime-portable patterns: profiles, Polars/DuckDB/delta-rs, Delta DV/CDF/liquid clustering, metadata loop, runMultiple, Fabric-only cells.
- **nb_lakehouse_health_audit.ipynb** — Delta table inventory & health report (flags → maintenance).
- **nb_lakehouse_maintenance.ipynb** — OPTIMIZE / REORG PURGE / VACUUM, dry-run default, logged.
- **nb_data_quality.ipynb** — declarative rules, severity gates, quarantine.
- **nb_ingestion_generic.ipynb** — metadata-driven worker; watermark state; self-proving idempotency.
- **nb_nee_fallback_analyzer.ipynb** — measure NEE on vs off: native coverage per query, ANSI×NEE trade-off on Runtime 2.0.
- **nb_metadata_sqldb_prototype.ipynb** — Fabric SQL Database metadata framework: DDL, pyodbc+Entra, forward-only watermarks, gotchas.
- **nb_cdf_incremental_pattern.ipynb** — CDF deltas without MLV: SQL DB watermark, version-bounded pushdown, net-change collapse, retention guard.
- **nb_api_zip_ingestion.ipynb** — rate-limited API + zipped-JSON ingestion, datetime-partitioned landing, CU logging.
- **nb_fabric_log_diagnostics.ipynb** — Fabric Spark Monitoring REST API client: jobs/stages/skew/spill/Advisor -> ranked diagnosis.
- **nb_eventlog_analysis.ipynb** — download + analyse Spark event logs from any Fabric URL shape.
- **nb_workspace_monitoring.ipynb** — query the Monitoring Eventhouse (KQL library over ItemJobEvents etc.), alerting guidance, Spark-logs-to-Eventhouse route (emitter → Eventstream).

## Standards & reports
- **fabric_coding_standards.md** — the 8 platform coding principles, cross-referenced to the HTML doc.
- **plan_review_demo.md** — sample analyzer output over a demo notebook tree.
