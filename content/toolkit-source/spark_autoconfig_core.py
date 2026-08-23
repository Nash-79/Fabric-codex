"""
spark_autoconfig_core.py
=========================
Pure-Python heuristic engine behind the Spark Auto-Configurator notebook utility.

Deliberately has ZERO dependency on `pyspark` or `notebookutils` in this module, so every
heuristic can be unit-tested in any Python interpreter, independent of a live Spark session.
The notebook (spark_auto_config_utility.ipynb) imports this module and wraps it with the
Spark- and Fabric-facing I/O (reading paths, calling spark.conf.set, etc).

Every recommendation below cites its basis. Three categories are used throughout, and every
`Recommendation` records which one applies:

  SPARK_DEFAULT   - a documented default shipped by Apache Spark itself.
  FABRIC_DOC      - a figure or behaviour documented by Microsoft for Fabric specifically.
  HEURISTIC       - a widely-used community/industry rule of thumb, not a hard Spark rule.
                     These are starting points to validate against the Spark UI, not guarantees.

This distinction matters: this module will never present a HEURISTIC as if it were a
SPARK_DEFAULT or a documented Fabric behaviour.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Literal
import math

Basis = Literal["SPARK_DEFAULT", "FABRIC_DOC", "HEURISTIC"]
Scope = Literal["runtime", "session_start"]

# --------------------------------------------------------------------------------------
# Config mutability. Empirically verified against a live local Spark 3.5.1 session
# (see test_e2e.py / probe_mutability.py in the companion utility repo): calling
# spark.conf.set() on a "session_start" key raises AnalysisException[CANNOT_MODIFY_CONFIG].
# These configs are read once when the executor/driver JVM (SparkEnv) starts, so they must
# be supplied before the session is created — via spark-submit / SparkConf on OSS Spark, or
# via the %%configure magic / environment Compute pane on Fabric. This distinction is real
# and load-bearing: a notebook that calls spark.conf.set("spark.executor.cores", ...) after
# the session already exists will simply crash, not silently no-op.
SESSION_START_PREFIXES = (
    "spark.executor.cores", "spark.executor.memory", "spark.executor.instances",
    "spark.driver.memory", "spark.driver.cores",
    "spark.memory.fraction", "spark.memory.storageFraction", "spark.memory.offHeap",
    "spark.dynamicAllocation.",
    # Shuffle-manager/plugin wiring (RSM, Shuffle Migration, Decision Layer) is resolved when
    # SparkEnv is constructed — architecturally a session-start decision even where a given
    # Spark build doesn't register the key as formally immutable. Treat as session-start.
    "spark.remote.shuffle.", "spark.storage.decommission.", "spark.sql.rsm.",
    # NEE/Gluten is a plugin: the Velox runtime and its off-heap arenas are wired up when
    # SparkEnv/the plugin registry is built, so toggling it mid-session has no effect.
    "spark.native.",
)


def _scope_for_key(key: str) -> Scope:
    if key.startswith("_"):
        return "runtime"  # informational notes; not a real config
    return "session_start" if key.startswith(SESSION_START_PREFIXES) else "runtime"



# --------------------------------------------------------------------------------------
# Reference constants (all cited in the notebook's markdown; kept here as single source
# of truth so the notebook and the interactive HTML doc can both be generated from them).
# --------------------------------------------------------------------------------------

SPARK_DEFAULTS = {
    "spark.sql.files.maxPartitionBytes": "134217728",          # 128 MB
    "spark.sql.shuffle.partitions": "200",
    "spark.sql.adaptive.enabled": "true",                      # since Spark 3.2
    "spark.sql.adaptive.coalescePartitions.enabled": "true",
    "spark.sql.adaptive.advisoryPartitionSizeInBytes": "67108864",  # 64 MB
    "spark.sql.adaptive.coalescePartitions.minPartitionSize": "1048576",  # 1 MB
    "spark.sql.adaptive.skewJoin.enabled": "true",
    "spark.sql.adaptive.skewJoin.skewedPartitionFactor": "5",
    "spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes": "268435456",  # 256 MB
    "spark.sql.autoBroadcastJoinThreshold": "10485760",        # 10 MB
    "spark.memory.fraction": "0.6",
    "spark.memory.storageFraction": "0.5",
    "spark.executor.memoryOverhead_factor": "0.10",            # min 384MB
    "spark.dynamicAllocation.executorIdleTimeout": "60s",
    "spark.dynamicAllocation.schedulerBacklogTimeout": "1s",   # 1s in modern Spark (was 5s pre-2.x docs vary; validate per version)
}

# Fabric Spark pool node sizes are memory-optimized at a fixed 8 GB of RAM per vCore.
# Source: Microsoft Learn, "Apache Spark compute for Data Engineering and Data Science".
FABRIC_NODE_SIZES = [
    {"name": "Small",   "vcores": 4,  "memory_gb": 32},
    {"name": "Medium",  "vcores": 8,  "memory_gb": 64},
    {"name": "Large",   "vcores": 16, "memory_gb": 128},
    {"name": "XLarge",  "vcores": 32, "memory_gb": 256},
    {"name": "XXLarge", "vcores": 64, "memory_gb": 512},
]

# 1 Fabric Capacity Unit (CU) = 2 Spark vCores. Source: Microsoft Learn, same page.
FABRIC_VCORES_PER_CU = 2


@dataclass
class Recommendation:
    key: str
    value: str
    basis: Basis
    reason: str
    scope: Scope = field(init=False)

    def __post_init__(self):
        self.scope = _scope_for_key(self.key)


@dataclass
class DataProfile:
    total_bytes: int
    file_count: int
    avg_file_size_bytes: Optional[int] = None
    estimated_row_count: Optional[int] = None
    smallest_join_side_bytes: Optional[int] = None
    expected_skew: bool = False
    source_format: str = "delta"

    def __post_init__(self):
        if self.avg_file_size_bytes is None and self.file_count > 0:
            self.avg_file_size_bytes = int(self.total_bytes / self.file_count)

    @property
    def total_gb(self) -> float:
        return self.total_bytes / (1024 ** 3)


@dataclass
class ClusterProfile:
    platform: Literal["fabric", "oss"] = "fabric"
    node_size: Optional[str] = None       # Fabric only, e.g. "Medium"
    num_nodes: int = 1                    # includes the driver node
    node_vcores: Optional[int] = None     # generic/OSS: vCores per worker node
    node_memory_gb: Optional[float] = None
    driver_memory_gb: Optional[float] = None

    def __post_init__(self):
        if self.platform == "fabric" and self.node_size:
            spec = next((n for n in FABRIC_NODE_SIZES if n["name"] == self.node_size), None)
            if spec:
                self.node_vcores = spec["vcores"]
                self.node_memory_gb = spec["memory_gb"]

    @property
    def num_executors(self) -> int:
        """Fabric: node:executor ratio is always 1:1, one node reserved for the driver
        (except single-node pools, where driver and executor share the one node)."""
        if self.platform == "fabric":
            return 1 if self.num_nodes <= 1 else self.num_nodes - 1
        # Generic/OSS: unknown executor-per-node packing without more info; assume 1:1
        # unless the caller overrides — conservative default, flagged in the report.
        return max(1, self.num_nodes - 1)

    @property
    def total_executor_vcores(self) -> int:
        return self.num_executors * (self.node_vcores or 0)


@dataclass
class WorkloadHints:
    kind: Literal["batch_etl", "interactive", "ml_training", "streaming"] = "batch_etl"
    cache_heavy: bool = False
    many_small_joins: bool = False


# --------------------------------------------------------------------------------------
# Individual heuristic functions — each one independently testable.
# --------------------------------------------------------------------------------------

def nearest_fabric_node(required_vcores: int) -> dict:
    """Smallest Fabric node size whose vCore count meets or exceeds the requirement."""
    for spec in FABRIC_NODE_SIZES:
        if spec["vcores"] >= required_vcores:
            return spec
    return FABRIC_NODE_SIZES[-1]


def estimate_shuffle_partitions(
    total_input_bytes: int,
    total_executor_vcores: int,
    target_partition_mb: int = 128,
    shuffle_fraction_of_input: float = 1.0,
) -> Recommendation:
    """
    Target: land close to `target_partition_mb` per shuffle partition (this mirrors the
    128 MB default Spark already uses for file-scan partitioning via
    spark.sql.files.maxPartitionBytes, applied here to the shuffle side too).

    `shuffle_fraction_of_input` is an explicit fudge factor: a shuffle's actual output size
    depends on the operation (a groupBy that aggregates away 90% of rows shuffles far less
    than its input; a join that explodes rows shuffles more). Without knowing the query,
    input size is used as the proxy — this is a HEURISTIC starting point, not a measurement.
    Validate and correct against the Spark UI's actual "Shuffle Write" metric after a real run.
    """
    shuffle_bytes = int(total_input_bytes * shuffle_fraction_of_input)
    target_bytes = target_partition_mb * 1024 * 1024
    by_size = math.ceil(shuffle_bytes / target_bytes) if shuffle_bytes > 0 else 1
    # Parallelism floor: don't go below ~2x total executor cores, or every core can't stay busy
    by_parallelism = max(total_executor_vcores * 2, 1)
    partitions = max(by_size, by_parallelism)
    # Sanity ceiling — beyond this, scheduling overhead of tiny tasks dominates
    partitions = min(partitions, 200_000)
    reason = (
        f"max(size-based [{shuffle_bytes/1e9:.2f} GB \u00f7 {target_partition_mb} MB \u2192 {by_size}], "
        f"parallelism floor [{total_executor_vcores} vCores \u00d7 2 \u2192 {by_parallelism}])"
    )
    return Recommendation("spark.sql.shuffle.partitions", str(partitions), "HEURISTIC", reason)


def recommend_advisory_partition_size(target_partition_mb: int = 128) -> List[Recommendation]:
    target_bytes = target_partition_mb * 1024 * 1024
    return [
        Recommendation("spark.sql.adaptive.enabled", "true", "SPARK_DEFAULT",
                        "On by default since Spark 3.2 / all current Fabric runtimes; set explicitly for clarity."),
        Recommendation("spark.sql.adaptive.coalescePartitions.enabled", "true", "SPARK_DEFAULT",
                        "Lets AQE merge small post-shuffle partitions at runtime rather than living with the static count above."),
        Recommendation("spark.sql.adaptive.coalescePartitions.parallelismFirst", "false", "HEURISTIC",
                        "Default is true, which makes AQE ignore advisoryPartitionSizeInBytes in favour of maximum parallelism. "
                        "Setting false makes coalescing respect the target size below — more predictable partition sizes, "
                        "recommended once you're past initial exploration."),
        Recommendation("spark.sql.adaptive.advisoryPartitionSizeInBytes", str(target_bytes), "HEURISTIC",
                        f"Spark default is 64 MB; raised to {target_partition_mb} MB to match the read-side maxPartitionBytes target "
                        "so partition sizes are consistent across the read and shuffle boundary."),
        Recommendation("spark.sql.adaptive.skewJoin.enabled", "true", "SPARK_DEFAULT",
                        "On by default; left on."),
    ]


def recommend_read_partitioning(avg_file_size_bytes: Optional[int], target_partition_mb: int = 128) -> List[Recommendation]:
    recs = []
    target_bytes = target_partition_mb * 1024 * 1024
    recs.append(Recommendation("spark.sql.files.maxPartitionBytes", str(target_bytes), "HEURISTIC",
                f"Spark default is 128 MB; set explicitly to {target_partition_mb} MB to keep read-side and shuffle-side "
                "partition sizing consistent (see advisoryPartitionSizeInBytes above)."))
    if avg_file_size_bytes is not None:
        avg_mb = avg_file_size_bytes / (1024 * 1024)
        if avg_mb < 16:
            recs.append(Recommendation("spark.sql.files.openCostInBytes", "4194304", "HEURISTIC",
                        f"Average source file size is only {avg_mb:.1f} MB (the 'small files problem'). Spark default "
                        "openCostInBytes (4 MB) already estimates the fixed cost of opening a file, which packs multiple "
                        "small files into one partition/task rather than one task per tiny file — confirmed left at default, "
                        "flagged here because it's the setting that matters most for this data shape."))
            recs.append(Recommendation("_advisory_small_files", "n/a", "HEURISTIC",
                        f"{avg_mb:.1f} MB average file size is well under the {target_partition_mb} MB target. Consider a "
                        "compaction/OPTIMIZE pass upstream (e.g. Delta OPTIMIZE) rather than only compensating for it at read time — "
                        "many small files also inflate driver-side listing time and metadata overhead independent of Spark's partitioning."))
    return recs


def recommend_executor_shape(cluster: ClusterProfile, cache_heavy: bool = False) -> (List[Recommendation], Optional[float]):
    """Returns (recommendations, resolved_executor_memory_gb). The second value feeds
    the memory-overhead calculation and is None when it can't be resolved (e.g. Fabric,
    where overhead isn't a user-facing dial anyway)."""
    recs = []
    executor_memory_gb = None
    if cluster.platform == "fabric":
        recs.append(Recommendation("_fabric_node_size", cluster.node_size or "unspecified", "FABRIC_DOC",
                    f"Fabric ties one executor to one node (1:1), always. There is no 'cores per executor' packing "
                    f"decision the way there is on YARN — the node size *is* the executor size. "
                    f"{cluster.node_size} = {cluster.node_vcores} vCores / {cluster.node_memory_gb} GB per executor "
                    "(Fabric Spark pools are memory-optimized at a fixed 8 GB per vCore)."))
        recs.append(Recommendation("_fabric_executor_cores_note", "n/a", "FABRIC_DOC",
                    "Within a chosen node size, Fabric environments let you under-populate the executor's core count "
                    "(e.g. run an 8-vCore node's executor at 4 cores) to trade parallelism for more memory headroom per "
                    "task — set via the environment's Compute pane or the %%configure magic, not via spark.executor.cores "
                    "alone, since the node's total vCores are still reserved either way."))
    else:
        # Classic YARN-style guidance (Cloudera): avoid 1-core "thin" executors (no benefit from
        # broadcast-variable/JVM reuse across tasks) and avoid >5-core "fat" executors (HDFS client
        # concurrency and GC pause problems dominate beyond ~5 concurrent tasks per JVM).
        cores_per_executor = 4 if cache_heavy else 5
        cache_note = (" Reduced to 4 here because cache_heavy=True leaves more headroom per task for storage memory pressure."
                       if cache_heavy else " Left at the standard 5 (cache_heavy=False, so no extra per-task memory headroom was traded away).")
        recs.append(Recommendation("spark.executor.cores", str(cores_per_executor), "HEURISTIC",
                    "Classic YARN sizing guidance (Cloudera): stay at or below ~5 concurrent tasks per executor JVM. "
                    "Below ~3 cores, per-executor JVM/broadcast overhead is paid too many times; above ~5, HDFS client "
                    "concurrency and GC pause times start to dominate." + cache_note))
        if cluster.node_vcores and cluster.node_memory_gb:
            executors_per_node = max(1, (cluster.node_vcores - 1) // cores_per_executor)  # -1 core reserved for OS/NM daemon
            recs.append(Recommendation("_executors_per_node", str(executors_per_node), "HEURISTIC",
                        f"({cluster.node_vcores} vCores \u2212 1 reserved for OS/node-manager daemons) \u00f7 {cores_per_executor} cores/executor."))
            usable_node_memory_gb = max(cluster.node_memory_gb - 1, 1)  # ~1GB reserved for OS
            executor_memory_gb = usable_node_memory_gb / executors_per_node
            recs.append(Recommendation("spark.executor.memory", f"{executor_memory_gb:.2f}g", "HEURISTIC",
                        f"({cluster.node_memory_gb} GB node \u2212 ~1 GB OS reserve) \u00f7 {executors_per_node} executors/node. "
                        "This is memory BEFORE the overhead deduction below — spark.executor.memory sets JVM heap size "
                        "directly; memoryOverhead is requested by Spark on top of this, not carved out of it."))
    return recs, executor_memory_gb


def recommend_memory_fractions(cache_heavy: bool = False) -> List[Recommendation]:
    if cache_heavy:
        return [
            Recommendation("spark.memory.fraction", "0.6", "SPARK_DEFAULT", "Left at Spark default."),
            Recommendation("spark.memory.storageFraction", "0.6", "HEURISTIC",
                        "Raised from the 0.5 default because this workload is cache-heavy (repeated reuse of a persisted "
                        "DataFrame/table). This raises the floor protected from eviction by execution memory; execution "
                        "can still borrow spare storage memory when it's genuinely idle."),
        ]
    return [
        Recommendation("spark.memory.fraction", "0.6", "SPARK_DEFAULT",
                    "Spark default. Only worth raising (e.g. toward 0.7-0.8) for execution-heavy, cache-light SQL/DataFrame "
                    "jobs, and only after confirming via the Spark UI that GC time or shuffle spill — not caching — is the "
                    "actual bottleneck."),
        Recommendation("spark.memory.storageFraction", "0.5", "SPARK_DEFAULT", "Spark default; no caching signal to justify changing it."),
    ]


def recommend_executor_memory_overhead(executor_memory_gb: float, platform: str) -> Recommendation:
    if platform == "fabric":
        return Recommendation("_memory_overhead_note", "n/a", "FABRIC_DOC",
                    "Fabric's environment Compute pane exposes a fixed menu of executor-memory choices per node size "
                    "(e.g. specific GB values for a Large node) that already reserve overhead — there is no separate "
                    "spark.executor.memoryOverhead dial to set by hand as there is on generic YARN/Kubernetes Spark.")
    overhead_gb = max(0.375, 0.10 * executor_memory_gb)  # 384 MB floor, 10% factor — Spark default formula
    return Recommendation("spark.executor.memoryOverhead", f"{overhead_gb:.2f}g", "SPARK_DEFAULT",
                f"Spark default formula: max(384 MB, 0.10 \u00d7 executor memory). Covers JVM internals, PySpark worker "
                "processes, and native/off-heap allocations outside the JVM heap.")


def recommend_broadcast_threshold(
    smallest_join_side_bytes: Optional[int],
    driver_memory_gb: Optional[float] = None,
) -> Recommendation:
    default_bytes = 10 * 1024 * 1024
    if smallest_join_side_bytes is None:
        return Recommendation("spark.sql.autoBroadcastJoinThreshold", str(default_bytes), "SPARK_DEFAULT",
                    "No join-side size profile supplied, so left at Spark's conservative 10 MB default. If you know one "
                    "side of your main join is small, re-run analyze() pointed at that table to get a tuned value.")
    # Industry-common production ceiling: 200-500MB, well below typical executor memory,
    # and only if it comfortably covers the actual smallest side with headroom.
    headroom_target = int(smallest_join_side_bytes * 1.5)
    ceiling = 512 * 1024 * 1024
    recommended = min(max(headroom_target, default_bytes), ceiling)
    return Recommendation("spark.sql.autoBroadcastJoinThreshold", str(recommended), "HEURISTIC",
                f"Smallest known join side is ~{smallest_join_side_bytes/1e6:.1f} MB; recommending "
                f"{recommended/1e6:.0f} MB (1.5\u00d7 headroom over that side, capped at 512 MB). Broadcasting avoids a "
                "shuffle entirely for this join, but every executor pays this memory cost, and the driver has to collect "
                "and broadcast it first — verify spark.driver.memory has headroom.")


def recommend_autoscale_bounds(num_shuffle_partitions: int, cluster: ClusterProfile) -> List[Recommendation]:
    if cluster.platform != "fabric" or not cluster.node_vcores:
        return []
    ideal_executors = max(1, math.ceil(num_shuffle_partitions / cluster.node_vcores))
    max_nodes = ideal_executors + 1  # +1 for the driver node
    return [
        Recommendation("_autoscale_min_nodes", "1", "HEURISTIC",
                    "Start autoscale at 1 node; Efficient Scaledown (see Part 5-8 of the Efficient Scaledown internals "
                    "doc) means idle executors are released quickly, so a low floor costs little."),
        Recommendation("_autoscale_max_nodes", str(min(max_nodes, 64)), "HEURISTIC",
                    f"Estimated {ideal_executors} executors needed to give every shuffle-stage partition a core "
                    f"({num_shuffle_partitions} partitions \u00f7 {cluster.node_vcores} vCores/node), +1 node for the "
                    "driver. Capped at 64 nodes as a sanity ceiling — validate against your capacity SKU's max node limit."),
    ]


def recommend_fabric_efficient_scaledown() -> List[Recommendation]:
    """Directly reuses the recommended configuration block from the companion
    'Efficient Scaledown & Remote Shuffle Manager' internals document (Part 9.1)."""
    return [
        Recommendation("spark.remote.shuffle.enabled", "true", "FABRIC_DOC",
                    "Enables Remote Shuffle Manager. Requires NEE, Runtime 1.3+, and a non-HNS BlockBlobStorage account "
                    "reachable without Private Link — see the Efficient Scaledown internals doc, Part 10, before enabling in a "
                    "network-restricted environment."),
        Recommendation("spark.sql.rsm.decisionlayer.enabled.level", "stage", "FABRIC_DOC", "Per-stage local/remote shuffle routing."),
        Recommendation("spark.sql.adaptive.shuffleWrite.enabled", "true", "FABRIC_DOC", "AQE participates in the shuffle write phase."),
        Recommendation("spark.storage.decommission.shuffleBlocks.enabled", "true", "FABRIC_DOC", "Migrates local shuffle blocks off a decommissioning executor."),
        Recommendation("spark.storage.decommission.shuffleBlocks.cleanup", "true", "FABRIC_DOC", "Cleans up source blocks after a successful migration."),
        Recommendation("spark.storage.decommission.shuffleBlocks.migrateToFallbackStorage", "true", "FABRIC_DOC", "Falls back to Blob Storage if no peer executor can accept a migrating block."),
        Recommendation("spark.storage.decommission.fallbackStorage.cleanUp", "true", "FABRIC_DOC", "Bounds fallback storage cost over time."),
    ]


def recommend_nee_memory_split(
    total_node_memory_gb: float,
    is_nee_enabled: bool,
    off_heap_ratio: float = 0.30,
) -> List[Recommendation]:
    """Off-heap sizing for the Native Execution Engine (Gluten/Velox).

    NEE executes vectorized operators in native C++ *outside* the JVM heap. Those buffers are
    drawn from Spark's off-heap pool, not from `spark.memory.fraction`. If off-heap is left at
    the default (disabled, size 0) while NEE is on, Velox allocations are squeezed into whatever
    the container has left after the JVM heap is reserved — which is how a job that ran fine on
    the JVM starts dying with native allocation failures rather than a normal Java OOM.

    The split below reserves `off_heap_ratio` of node memory for native buffers and leaves the
    remainder to the JVM. 0.30 is a starting point, not a measured optimum: shuffle-heavy and
    wide-aggregation stages push it higher, scan-and-filter workloads need less. Confirm against
    the executor's peak off-heap usage in the Spark UI before treating it as settled.

    Returns an empty list when NEE is off — nothing to size, and emitting off-heap keys on a
    pure-JVM session only invites confusion.
    """
    if not is_nee_enabled:
        return []
    if not total_node_memory_gb or total_node_memory_gb <= 0:
        return []
    if not (0.0 < off_heap_ratio < 0.9):
        raise ValueError(f"off_heap_ratio must be in (0, 0.9); got {off_heap_ratio}")

    off_heap_gb = round(total_node_memory_gb * off_heap_ratio, 1)
    jvm_heap_gb = round(total_node_memory_gb - off_heap_gb, 1)

    return [
        Recommendation("spark.memory.offHeap.enabled", "true", "FABRIC_DOC",
            "Required when spark.native.enabled=true. Velox allocates its columnar batches, hash "
            "tables and sort buffers off-heap; with this left false the native engine has no "
            "governed pool to draw from."),
        Recommendation("spark.memory.offHeap.size", f"{off_heap_gb:.0f}g", "HEURISTIC",
            f"~{int(off_heap_ratio * 100)}% of the {total_node_memory_gb:g} GB node reserved for native "
            f"buffers, leaving ~{jvm_heap_gb:g} GB to the JVM. Starting point only — raise it if the "
            "Spark UI shows native allocation failures or heavy NEE fallback on wide aggregations, "
            "lower it if off-heap peak usage stays well under the reservation."),
        Recommendation("_nee_heap_note", f"~{jvm_heap_gb:g}g JVM heap", "HEURISTIC",
            "JVM heap must come DOWN as off-heap goes up — the two share one container budget. On "
            "Fabric you do not set spark.executor.memory directly; pick the executor-memory value in "
            "the Environment's Compute pane that lands nearest this figure."),
    ]


def build_full_recommendation(
    data: DataProfile,
    cluster: ClusterProfile,
    workload: WorkloadHints,
    target_partition_mb: int = 128,
    enable_efficient_scaledown: bool = False,
    nee_enabled: bool = False,
    off_heap_ratio: float = 0.30,
) -> List[Recommendation]:
    recs: List[Recommendation] = []
    recs.append(estimate_shuffle_partitions(data.total_bytes, cluster.total_executor_vcores, target_partition_mb))
    recs.extend(recommend_advisory_partition_size(target_partition_mb))
    recs.extend(recommend_read_partitioning(data.avg_file_size_bytes, target_partition_mb))
    shape_recs, resolved_executor_memory_gb = recommend_executor_shape(cluster, cache_heavy=workload.cache_heavy)
    recs.extend(shape_recs)
    recs.extend(recommend_memory_fractions(cache_heavy=workload.cache_heavy))
    if cluster.platform == "fabric" and cluster.node_memory_gb:
        recs.append(recommend_executor_memory_overhead(cluster.node_memory_gb, cluster.platform))
    elif resolved_executor_memory_gb:
        recs.append(recommend_executor_memory_overhead(resolved_executor_memory_gb, cluster.platform))
    recs.append(recommend_broadcast_threshold(data.smallest_join_side_bytes, cluster.driver_memory_gb))
    shuffle_rec = recs[0]
    recs.extend(recommend_autoscale_bounds(int(shuffle_rec.value), cluster))
    if data.expected_skew:
        recs.append(Recommendation("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5", "SPARK_DEFAULT",
                    "Left at default; skew handling is already enabled above. If skew is severe, inspect the Spark UI "
                    "stage detail for the actual skew ratio before overriding this."))
    if nee_enabled and cluster.node_memory_gb:
        recs.extend(recommend_nee_memory_split(cluster.node_memory_gb, True, off_heap_ratio))
    if cluster.platform == "fabric" and enable_efficient_scaledown:
        recs.extend(recommend_fabric_efficient_scaledown())
    return recs
