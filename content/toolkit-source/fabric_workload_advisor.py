"""
fabric_workload_advisor.py
===========================
Capacity- and workload-aware advisor for Microsoft Fabric Spark & Python notebooks.
Companion to spark_autoconfig_core.py (Spark tuning heuristics) — this module adds the
Fabric-platform layer: capacity (CU) planning, engine choice (Python single-node vs Spark),
Delta table property recommendations, spill-risk estimation, and runtime profiles that make
the same code work on Runtime 1.3 (Spark 3.5 / Delta 3.2) and Runtime 2.0 (Spark 4.x / Delta 4.2).

Basis tags (same convention as spark_autoconfig_core):
  FABRIC_DOC  - documented Microsoft Fabric behaviour/figure
  SPARK_DOC   - documented Apache Spark behaviour/default
  HEURISTIC   - community/industry rule of thumb; validate against your Spark UI / Capacity Metrics
Pure Python, no pyspark dependency, unit-testable anywhere.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Literal
import math

# ----------------------------------------------------------------------------- constants

# FABRIC_DOC: 1 CU = 2 Spark vCores; burst factor 3x. Burst serves concurrency AND can serve
# a single job: with Job bursting enabled on the capacity, one job reaches the burst ceiling
# if the Workspace Pool Autoscale max nodes is set high enough (pool max = per-job ceiling).
FABRIC_SKUS = {"F2": 2, "F4": 4, "F8": 8, "F16": 16, "F32": 32,
               "F64": 64, "F128": 128, "F256": 256, "F512": 512, "F1024": 1024}
VCORES_PER_CU = 2
BURST_FACTOR = 3

# FABRIC_DOC: memory-optimized nodes, fixed 8 GB per vCore.
NODE_SIZES = {"Small": (4, 32), "Medium": (8, 64), "Large": (16, 128),
              "XLarge": (32, 256), "XXLarge": (64, 512)}

# FABRIC_DOC: Python notebooks run single-node, default 2 vCores / 16 GB.
PYTHON_NOTEBOOK_VCORES = 2
PYTHON_NOTEBOOK_GB = 16

RUNTIME_PROFILES = {
    # Keys usable directly with spark.conf.set at session start (%%configure) unless noted.
    "fabric-1.3": {
        "spark_version": "3.5", "delta_version": "3.2", "python": "3.11", "scala": "2.12",
        "status": "GA - recommended for production",
        "ansi_default": False,
        "session_conf": {
            # NEE opt-in (FABRIC_DOC)
            "spark.native.enabled": "true",
        },
        "liquid_clustering": "preview",   # Delta 3.2 clustered tables are preview-gated
        "notes": [
            "Liquid clustering on Delta 3.2 requires the clustered-table preview flag; validate before production.",
            "Deletion vectors, CDF, Optimize Write fully supported.",
        ],
    },
    "fabric-2.0": {
        "spark_version": "4.1", "delta_version": "4.2", "python": "3.13", "scala": "2.13",
        "status": "GA - production ready (not yet the default runtime)",
        "ansi_default": True,
        "session_conf": {
            "spark.native.enabled": "true",
        },
        "liquid_clustering": "supported",
        "notes": [
            "ANSI mode is ON by default (Spark 4.x). NEE currently falls back under ANSI: choose "
            "ansi_strategy='native_speed' to set spark.sql.ansi.enabled=false, or 'ansi_safety' to keep it.",
            "Re-publish Environment libraries (Python 3.13). Recompile Scala JARs (2.13/JDK 21).",
            "Delta 4.2 features are GA, but Delta 4.x-only table features (collations, VARIANT columns) remain Spark-only - interop caution.",
        ],
    },
    "oss-3.5": {"spark_version": "3.5", "delta_version": "3.2", "ansi_default": False,
                 "status": "OSS", "session_conf": {}, "liquid_clustering": "preview", "notes": []},
    "oss-4.x": {"spark_version": "4.x", "delta_version": "4.x", "ansi_default": True,
                 "status": "OSS", "session_conf": {}, "liquid_clustering": "supported", "notes": []},
}


@dataclass
class Advice:
    key: str
    value: str
    basis: Literal["FABRIC_DOC", "SPARK_DOC", "HEURISTIC"]
    reason: str


# ----------------------------------------------------------------------------- capacity

def capacity_summary(sku: str, node_size: str = "Medium") -> dict:
    """CU -> vCores -> node math for a capacity. All figures FABRIC_DOC except where tagged."""
    cu = FABRIC_SKUS[sku]
    vc, gb = NODE_SIZES[node_size]
    base_vc = cu * VCORES_PER_CU
    burst_vc = base_vc * BURST_FACTOR
    return {
        "sku": sku, "cu": cu,
        "base_spark_vcores": base_vc,
        "burst_spark_vcores": burst_vc,
        "max_nodes_base": base_vc // vc,
        "max_nodes_burst": burst_vc // vc,
        "node_size": node_size, "node_vcores": vc, "node_memory_gb": gb,
        "cu_hours_per_day": cu * 24,
    }


def job_cu_cost(num_nodes: int, node_size: str, minutes: float) -> dict:
    """CU-seconds = vCore-seconds / 2 (FABRIC_DOC)."""
    vc, _ = NODE_SIZES[node_size]
    vcore_seconds = num_nodes * vc * minutes * 60
    return {"vcores": num_nodes * vc, "cu_seconds": vcore_seconds / VCORES_PER_CU,
            "cu_hours": vcore_seconds / VCORES_PER_CU / 3600}


def admission_check(sku: str, node_size: str, job_min_nodes: int,
                     concurrent_vcores_in_use: int = 0) -> Advice:
    """Optimistic admission: a job is admitted if its MINIMUM nodes fit in remaining burst capacity.
    Interactive submissions that don't fit fail with HTTP 430; scheduled jobs queue (FABRIC_DOC)."""
    cap = capacity_summary(sku, node_size)
    need = job_min_nodes * cap["node_vcores"]
    remaining = cap["burst_spark_vcores"] - concurrent_vcores_in_use
    if need <= remaining:
        return Advice("_admission", "ADMITTED", "FABRIC_DOC",
                       f"Minimum {job_min_nodes} x {node_size} = {need} vCores fits in remaining "
                       f"{remaining}/{cap['burst_spark_vcores']} burst vCores.")
    return Advice("_admission", "REJECTED_OR_QUEUED", "FABRIC_DOC",
                   f"Needs {need} vCores; only {remaining} remain under burst. Interactive submit -> "
                   f"HTTP 430 TooManyRequestsForCapacity; pipeline/scheduled submit -> queued. "
                   f"Lower the pool minimum (min nodes admits, autoscale grows later) or move this "
                   f"workload to Autoscale Billing for Spark.")


# ----------------------------------------------------------------------------- engine choice

def choose_engine(total_gb: float, needs_distributed_shuffle: bool,
                   writes_gold_vorder: bool = False,
                   runtime: str = "fabric-1.3") -> List[Advice]:
    """Python single-node (Polars/DuckDB) vs Spark decision. Thresholds are HEURISTIC:
    validate against your data; the caveats (V-Order, distributed shuffle) are hard rules."""
    out = []
    if writes_gold_vorder:
        out.append(Advice("engine", "spark", "FABRIC_DOC",
            "Target table needs V-Order (gold / Direct Lake consumption). delta-rs (Python) cannot "
            "apply V-Order, so the write must go through Fabric Spark regardless of data size."))
    elif needs_distributed_shuffle:
        out.append(Advice("engine", "spark", "HEURISTIC",
            "Distributed shuffle required (large join / global sort) - single-node engines would "
            "spill or fail; this is Spark territory regardless of input size."))
    elif total_gb < 10:
        out.append(Advice("engine", "python-notebook", "HEURISTIC",
            f"~{total_gb:g} GB fits a single node comfortably. Fabric Python notebook "
            f"({PYTHON_NOTEBOOK_VCORES} vCores / {PYTHON_NOTEBOOK_GB} GB default) with Polars/DuckDB "
            f"reading Delta directly: seconds to start, a fraction of Spark's CU cost."))
        out.append(Advice("engine_hint", "polars for transforms, duckdb for SQL-shaped analytics", "HEURISTIC",
            "Both are lazy/vectorized; push filters + column selection into scan_delta()/delta_scan(). "
            "Write back with delta-rs (bronze/silver fine; not V-Order gold)."))
    elif total_gb < 100:
        out.append(Advice("engine", "spark-small", "HEURISTIC",
            f"~{total_gb:g} GB: small Spark session (2-3 Medium nodes or 1 Large), NEE on. "
            f"Below the scale where wide-cluster shuffles pay for themselves."))
    else:
        out.append(Advice("engine", "spark-scaled", "HEURISTIC",
            f"~{total_gb:g} GB: scaled Spark pool - size with spark_autoconfig_core heuristics; "
            f"enable Efficient Scaledown so autoscale releases nodes the moment compute finishes."))
    prof = RUNTIME_PROFILES[runtime]
    if prof.get("ansi_default") and out[0].value.startswith("spark"):
        out.append(Advice("ansi_note", "decide ansi vs native speed", "FABRIC_DOC",
            "Spark 4.x: ANSI on by default, and NEE currently falls back under ANSI. Choose "
            "ansi_strategy in build_session_conf()."))
    return out


# ----------------------------------------------------------------------------- spill risk

def spill_risk(executor_memory_gb: float, executor_cores: int,
                advisory_partition_mb: int = 128,
                memory_fraction: float = 0.6,
                expansion_factor: float = 4.0) -> List[Advice]:
    """Estimates whether a task's working set fits per-core execution memory.
    expansion_factor (HEURISTIC, 3-5x) covers decompression + JVM object overhead + operator
    buffers for wide transforms. This minimizes spill/OOM risk; it cannot guarantee zero OOM
    (data-dependent rows, exploding joins, huge strings can defeat any static sizing)."""
    usable = (executor_memory_gb * 1024 - 300) * memory_fraction  # MB, minus reserved (SPARK_DOC)
    per_core = usable / max(executor_cores, 1)
    need = advisory_partition_mb * expansion_factor
    out = [Advice("_per_core_exec_memory", f"{per_core:.0f} MB", "SPARK_DOC",
                   f"({executor_memory_gb} GB - 300 MB reserved) x {memory_fraction} fraction / {executor_cores} cores.")]
    if per_core >= need:
        out.append(Advice("_spill_risk", "LOW", "HEURISTIC",
            f"Per-core execution memory {per_core:.0f} MB >= estimated task working set "
            f"{need:.0f} MB ({advisory_partition_mb} MB partition x {expansion_factor}x expansion)."))
    else:
        smaller_partition = int(per_core / expansion_factor)
        fewer_cores = max(1, int(usable / need))
        out.append(Advice("_spill_risk", "HIGH", "HEURISTIC",
            f"Working set ~{need:.0f} MB exceeds per-core memory {per_core:.0f} MB. Fix by ONE of: "
            f"(a) shrink partitions - advisoryPartitionSizeInBytes ~{max(smaller_partition,16)} MB; "
            f"(b) fewer cores per executor - {fewer_cores} keeps this partition size; "
            f"(c) larger node size. Confirm afterwards: stage 'Spill' columns must read zero."))
    return out


# ----------------------------------------------------------------------------- table properties

def recommend_table_properties(size_gb: float, layer: Literal["bronze", "silver", "gold"],
                                write_pattern: Literal["append", "merge", "overwrite"],
                                read_pattern: Literal["etl", "bi", "adhoc"],
                                runtime: str = "fabric-1.3",
                                wide_string_columns: int = 0) -> List[Advice]:
    """Delta table property recommendations. Mirrors the interactive advisor in the HTML doc."""
    prof = RUNTIME_PROFILES[runtime]
    out = [Advice("spark.microsoft.delta.optimizeWrite.enabled", "true", "FABRIC_DOC",
                   "Fabric default; bin-packs writes toward target file size - keep on everywhere.")]
    if write_pattern == "merge":
        out.append(Advice("spark.microsoft.delta.optimizeWrite.binSize", "134217728", "HEURISTIC",
            "128 MB bins for merge-heavy tables so rewrites touch less data (default bin ~1 GB)."))
        out.append(Advice("delta.enableDeletionVectors", "true", "FABRIC_DOC",
            "MERGE/UPDATE/DELETE mark rows instead of rewriting files. Schedule OPTIMIZE / "
            "REORG TABLE ... APPLY (PURGE); verify external readers support DV."))
    vorder = layer == "gold" or (read_pattern == "bi" and layer != "bronze")
    out.append(Advice("spark.sql.parquet.vorder.default", str(vorder).lower(),
                       "FABRIC_DOC" if vorder else "HEURISTIC",
        "Direct Lake / SQL-endpoint reads benefit; ~10-15% write cost." if vorder else
        "Write-heavy / non-consumption layer: skip the write cost. Check the workspace's current "
        "default with spark.conf.get() - it has changed across Fabric updates."))
    if layer in ("bronze", "silver"):
        out.append(Advice("delta.enableChangeDataFeed", "true", "FABRIC_DOC",
            "Downstream layer reads table_changes() incrementally instead of full rescans."))
    if size_gb >= 10:
        gate = ("preview-gated on this runtime (Delta 3.2) - validate first"
                if prof["liquid_clustering"] == "preview" else "supported (Delta 4.2)")
        out.append(Advice("CLUSTER BY", "1-4 filter/join columns", "HEURISTIC",
            f"Liquid clustering - {gate}. Replaces partitioning AND Z-ORDER; mutually exclusive "
            f"with partitioning. Never partition tables under ~1 TB except for retention boundaries."))
    else:
        out.append(Advice("_layout", "none", "HEURISTIC",
            f"{size_gb:g} GB: no clustering/partitioning - Optimize Write + periodic OPTIMIZE suffices."))
    if wide_string_columns > 0:
        out.append(Advice("_schema_note", f"{wide_string_columns} wide string column(s)", "HEURISTIC",
            "Wide strings inflate task working sets (spill/OOM driver). Prune them out of hot-path "
            "selects; consider trimming/normalizing at bronze->silver; revisit spill_risk() with a "
            "higher expansion factor (5-6x)."))
    out.append(Advice("_maintenance", "OPTIMIZE " + ("daily-ish" if write_pattern == "merge" else "weekly-ish")
                       + "; VACUUM past retention only", "HEURISTIC",
        "Compaction cadence scales with churn. Never VACUUM below your time-travel/CDF window (default 7 days)."))
    if layer == "gold" and read_pattern == "bi":
        out.append(Advice("_mlv", "consider Materialized Lake View", "FABRIC_DOC",
            "SQL-expressible silver->gold transforms: let Fabric own refresh + lineage instead of orchestrating."))
    return out


# ----------------------------------------------------------------------------- session conf

def build_session_conf(runtime: str,
                        ansi_strategy: Literal["ansi_safety", "native_speed", "default"] = "default",
                        enable_nee: bool = True,
                        enable_efficient_scaledown: bool = False) -> Dict[str, str]:
    """Session-start configuration bundle for a runtime. Paste into %%configure -f {"conf": {...}}
    (Fabric) or SparkSession.builder.config() (OSS). Identical code path for both runtimes -
    the differences live in this dict, which is the whole point of configuration-driven design."""
    prof = RUNTIME_PROFILES[runtime]
    conf: Dict[str, str] = {}
    if enable_nee and runtime.startswith("fabric"):
        conf["spark.native.enabled"] = "true"
    if prof.get("ansi_default"):
        if ansi_strategy == "native_speed":
            conf["spark.sql.ansi.enabled"] = "false"   # regain NEE offload; lose ANSI guards
        elif ansi_strategy == "ansi_safety":
            conf["spark.sql.ansi.enabled"] = "true"    # explicit; NEE falls back on covered ops
    else:
        if ansi_strategy == "ansi_safety":
            conf["spark.sql.ansi.enabled"] = "true"    # pre-test 4.x behaviour on 3.5
    if enable_efficient_scaledown and runtime.startswith("fabric"):
        conf.update({
            "spark.remote.shuffle.enabled": "true",
            "spark.sql.rsm.decisionlayer.enabled.level": "stage",
            "spark.sql.adaptive.shuffleWrite.enabled": "true",
            "spark.storage.decommission.shuffleBlocks.enabled": "true",
            "spark.storage.decommission.shuffleBlocks.cleanup": "true",
            "spark.storage.decommission.shuffleBlocks.migrateToFallbackStorage": "true",
            "spark.storage.decommission.fallbackStorage.cleanUp": "true",
        })
    return conf


def calculate_burst_debt(sku: str, avg_burst_vcores: int, duration_minutes: float) -> dict:
    """Calculates smoothing debt accumulation and predicts Fabric capacity throttling phases.
    Interactive: 5-minute moving window. Background: 24-hour moving window."""
    cap = capacity_summary(sku)
    base_vc = cap["base_spark_vcores"]
    cu_rate_per_sec = cap["cu"]
    
    # Debt rate
    excess_vcores = max(0, avg_burst_vcores - base_vc)
    excess_cu_rate = excess_vcores / VCORES_PER_CU
    total_debt_cu_seconds = excess_cu_rate * duration_minutes * 60
    
    # 24-hr capacity limit in CU-seconds
    daily_cu_seconds = cap["cu_hours_per_day"] * 3600
    debt_percentage_of_day = (total_debt_cu_seconds / daily_cu_seconds) * 100
    
    # Estimate throttling risk phases
    phase = "HEALTHY"
    if avg_burst_vcores > base_vc * BURST_FACTOR:
        phase = "PHASE_3_HARD_THROTTLE_REJECT"
    elif debt_percentage_of_day > 80:
        phase = "PHASE_3_HARD_THROTTLE_RISK"
    elif duration_minutes > 60 and avg_burst_vcores > base_vc:
        phase = "PHASE_2_BACKGROUND_REJECTION"
    elif duration_minutes > 10 and avg_burst_vcores > base_vc:
        phase = "PHASE_1_INTERACTIVE_DELAY"
        
    return {
        "sku": sku,
        "base_vcores": base_vc,
        "avg_burst_vcores": avg_burst_vcores,
        "burst_duration_min": duration_minutes,
        "debt_cu_seconds": total_debt_cu_seconds,
        "debt_pct_of_24hr_capacity": round(debt_percentage_of_day, 2),
        "throttling_risk_phase": phase,
        "recovery_time_minutes": round(total_debt_cu_seconds / (base_vc / VCORES_PER_CU) / 60, 1) if base_vc else 0
    }


def forecast_fabric_throttling(sku: str,
                               smoothed_cu_24h_percent: float,
                               carryover_ratio: float = 0.0) -> dict:
    """Fabric's 3-stage throttling forecast.

    FABRIC_DOC: throttling is driven by *future smoothed consumption* — how many minutes of
    already-committed CU the capacity is carrying — not by instantaneous usage. The published
    thresholds are:

        carryover < 10 min      -> Stage 1: interactive requests DELAYED
        10 min <= x <= 60 min   -> Stage 2: interactive requests REJECTED (background still runs)
        carryover > 60 min      -> Stage 3: background requests REJECTED too

    Note the asymmetry teams get caught by: background jobs (pipelines, scheduled notebooks)
    smooth over 24 hours and keep running well past the point where interactive notebooks start
    getting rejected. An engineer will be told the capacity is unusable while the pipelines that
    caused it continue happily. Stage 3 is where scheduled work finally stops.

    Args:
        sku: capacity SKU, e.g. "F64".
        smoothed_cu_24h_percent: current 24h smoothed utilisation, 0-100+ (may exceed 100).
        carryover_ratio: committed future consumption expressed as a fraction of a 24h day
            (0.0 = nothing carried over; 0.0007 ~= 1 minute).

    Returns a dict with the stage, what still works, and the drain estimate.
    """
    if sku not in FABRIC_SKUS:
        raise KeyError(f"unknown SKU {sku!r}; known: {sorted(FABRIC_SKUS)}")
    if carryover_ratio < 0:
        raise ValueError("carryover_ratio must be >= 0")

    carryover_minutes = carryover_ratio * 24 * 60

    if carryover_minutes > 60:
        stage, code = 3, "STAGE_3_BACKGROUND_REJECTION"
        interactive, background = "REJECTED", "REJECTED"
        action = ("Everything is now being rejected, including scheduled pipelines. Either scale the "
                  "SKU up (takes effect immediately and clears the backlog faster) or pause "
                  "non-essential background jobs and wait out the drain.")
    elif carryover_minutes >= 10:
        stage, code = 2, "STAGE_2_INTERACTIVE_REJECTION"
        interactive, background = "REJECTED", "RUNNING"
        action = ("Notebooks and interactive SQL are being rejected while pipelines keep consuming. "
                  "Identify the top background consumers in the Capacity Metrics App and reschedule "
                  "them off-peak before this reaches Stage 3.")
    elif carryover_minutes > 0:
        stage, code = 1, "STAGE_1_INTERACTIVE_DELAY"
        interactive, background = "DELAYED", "RUNNING"
        action = ("Interactive submissions are being queued rather than refused. This is the early "
                  "warning — it is the cheapest point at which to intervene.")
    else:
        stage, code = 0, "HEALTHY"
        interactive, background = "RUNNING", "RUNNING"
        action = "No carryover. Capacity is keeping up with demand."

    # Utilisation is a separate axis: you can be over 100% smoothed and not yet throttled,
    # because smoothing spreads the debt forward before it becomes carryover.
    if smoothed_cu_24h_percent > 100 and stage == 0:
        action = (f"Smoothed utilisation is {smoothed_cu_24h_percent:.0f}% but no carryover has "
                  "accumulated yet. Debt is building and will surface as Stage 1 shortly.")

    return {
        "sku": sku,
        "cu": FABRIC_SKUS[sku],
        "smoothed_cu_24h_percent": round(smoothed_cu_24h_percent, 1),
        "carryover_minutes": round(carryover_minutes, 1),
        "throttle_stage": stage,
        "throttle_code": code,
        "interactive_jobs": interactive,
        "background_jobs": background,
        "recommended_action": action,
    }


def high_concurrency_advisor(active_sessions: int, total_node_memory_gb: float) -> Advice:
    """Evaluates High Concurrency mode session multiplexing risks."""
    if active_sessions <= 1:
        return Advice("high_concurrency", "STANDARD_SESSION", "FABRIC_DOC",
                      "Single session active; standard execution profile.")
    
    mem_per_session = total_node_memory_gb / active_sessions
    if mem_per_session < 12.0:
        return Advice("high_concurrency", "CRITICAL_MEMORY_CONTENTION", "HEURISTIC",
                      f"{active_sessions} concurrent notebook sessions sharing {total_node_memory_gb} GB yields "
                      f"only ~{mem_per_session:.1f} GB per session. Uncollected caches or driver collects will cause cross-session OOMs.")
    return Advice("high_concurrency", "CONCURRENCY_OK", "HEURISTIC",
                  f"{active_sessions} concurrent sessions sharing {total_node_memory_gb} GB (~{mem_per_session:.1f} GB/session). "
                  "Ensure teams unpersist cached DataFrames promptly.")


def render_configure_magic(conf: Dict[str, str]) -> str:
    import json
    return "%%configure -f\n" + json.dumps({"conf": conf}, indent=2)
