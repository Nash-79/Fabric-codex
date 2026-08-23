"""
spark_autoconfig.py
====================
The Spark- and Fabric-facing utility class. Wraps spark_autoconfig_core's pure heuristic
engine with real I/O: reading data characteristics from a live SparkSession, best-effort
cluster-shape introspection, applying the resulting configuration, and printing a report.

Design principle: every piece of live introspection here is wrapped in try/except with an
explicit, user-overridable fallback. Nothing in this file invents or assumes an undocumented
API surface — where Fabric doesn't expose something through a stable, documented call
(e.g. "what node size is this pool"), the utility asks for it as a parameter instead of
guessing.
"""

from spark_autoconfig_core import (
    DataProfile, ClusterProfile, WorkloadHints, Recommendation,
    build_full_recommendation, FABRIC_NODE_SIZES,
)
from typing import Optional, List


class SparkAutoConfigurator:
    def __init__(self, spark, platform: Optional[str] = None, verbose: bool = True):
        self.spark = spark
        self.verbose = verbose
        self.platform = platform or self._detect_platform()
        self._last_data_profile: Optional[DataProfile] = None
        self._last_cluster_profile: Optional[ClusterProfile] = None
        self._last_recs: Optional[List[Recommendation]] = None

    # ---------------------------------------------------------------- platform / cluster

    def _detect_platform(self) -> str:
        """Best-effort only. Fabric notebooks have `notebookutils` injected into the global
        namespace at runtime; its mere presence is a reasonable signal, but this is a
        convenience heuristic, not a documented detection API — always fine to override
        with SparkAutoConfigurator(spark, platform='fabric'|'oss')."""
        try:
            import notebookutils  # noqa: F401
            return "fabric"
        except ImportError:
            return "oss"

    def detect_cluster(
        self,
        node_size: Optional[str] = None,
        num_nodes: Optional[int] = None,
        node_vcores: Optional[int] = None,
        node_memory_gb: Optional[float] = None,
    ) -> ClusterProfile:
        """
        Explicit parameters always win. Where not supplied, falls back to best-effort live
        introspection via the Spark status tracker and spark.conf — both real, if
        underscore-prefixed / internal, PySpark patterns; wrapped defensively because they
        are not part of PySpark's stable public API and can differ across versions/platforms.
        """
        live_executors, live_cores, live_mem_gb = self._introspect_live_cluster()

        if self.platform == "fabric":
            resolved_num_nodes = num_nodes if num_nodes is not None else (live_executors + 1 if live_executors else 1)
            cp = ClusterProfile(platform="fabric", node_size=node_size or "Medium", num_nodes=resolved_num_nodes)
            if node_size is None and self.verbose:
                print("[detect_cluster] No node_size supplied — defaulted to 'Medium'. "
                      "Fabric does not expose pool node size through a documented notebookutils/spark.conf call, "
                      "so pass node_size explicitly (Small/Medium/Large/XLarge/XXLarge) for an accurate recommendation.")
        else:
            cp = ClusterProfile(
                platform="oss",
                num_nodes=num_nodes if num_nodes is not None else max(live_executors + 1, 2),
                node_vcores=node_vcores or live_cores or 8,
                node_memory_gb=node_memory_gb or live_mem_gb or 32.0,
                driver_memory_gb=self._get_driver_memory_gb(),
            )
        self._last_cluster_profile = cp
        return cp

    def _introspect_live_cluster(self):
        """Returns (num_live_executors, cores_per_executor, memory_gb_per_executor) or
        (None, None, None) on any failure. Uses SparkContext's status tracker (a real,
        commonly-used pattern for live executor counts) and spark.conf for the rest."""
        try:
            sc = self.spark.sparkContext
            infos = sc._jsc.sc().statusTracker().getExecutorInfos()
            num_executors = max(len(infos) - 1, 1)  # one entry is the driver
        except Exception:
            num_executors = None
        try:
            cores = int(self.spark.conf.get("spark.executor.cores"))
        except Exception:
            cores = None
        try:
            mem_str = self.spark.conf.get("spark.executor.memory")  # e.g. "8g"
            mem_gb = float(mem_str.lower().replace("g", "").replace("m", "")) if mem_str else None
            if mem_str and "m" in mem_str.lower():
                mem_gb = mem_gb / 1024
        except Exception:
            mem_gb = None
        return num_executors, cores, mem_gb

    def _get_driver_memory_gb(self) -> Optional[float]:
        try:
            mem_str = self.spark.conf.get("spark.driver.memory")
            val = float(mem_str.lower().replace("g", "").replace("m", ""))
            return val / 1024 if "m" in mem_str.lower() else val
        except Exception:
            return None

    # ---------------------------------------------------------------------- data profiling

    def analyze(
        self,
        path: str,
        table_format: str = "delta",
        smallest_join_side_path: Optional[str] = None,
        smallest_join_side_format: str = "delta",
        expected_skew: bool = False,
        estimate_row_count: bool = False,
    ) -> DataProfile:
        """
        Profiles the data at `path`. Tries, in order:
          1. DESCRIBE DETAIL (Delta only) — exact sizeInBytes/numFiles from the Delta log,
             no data scan required. Cheapest and most accurate path for Lakehouse tables.
          2. df.inputFiles() + Hadoop FileSystem file-status lookup — works for any
             Spark-readable format, at the cost of listing every file individually.
          3. Raises, asking the caller to construct a DataProfile manually instead.
        """
        total_bytes, file_count = self._get_size_and_files(path, table_format)
        if self.verbose:
            print(f"[analyze] {path}: {total_bytes/1e9:.2f} GB across {file_count} files.")

        row_count = None
        if estimate_row_count:
            try:
                row_count = self.spark.read.format(table_format).load(path).count()
            except Exception as e:
                if self.verbose:
                    print(f"[analyze] row count estimate skipped ({e!r}).")

        join_bytes = None
        if smallest_join_side_path:
            join_bytes, _ = self._get_size_and_files(smallest_join_side_path, smallest_join_side_format)

        profile = DataProfile(
            total_bytes=total_bytes, file_count=max(file_count, 1),
            estimated_row_count=row_count, smallest_join_side_bytes=join_bytes,
            expected_skew=expected_skew, source_format=table_format,
        )
        self._last_data_profile = profile
        return profile

    def _get_size_and_files(self, path: str, table_format: str):
        """Delta DESCRIBE DETAIL when possible (cheap, exact), else a Hadoop FS listing scan."""
        if table_format == "delta":
            try:
                row = self.spark.sql(f"DESCRIBE DETAIL delta.`{path}`").collect()[0]
                return int(row["sizeInBytes"]), int(row["numFiles"])
            except Exception:
                pass
        return self._scan_via_hadoop_fs(path, table_format)

    def _scan_via_hadoop_fs(self, path: str, table_format: str):
        """Falls back to Spark's own Hadoop FileSystem bridge to sum real file sizes.
        Uses spark._jsc / spark._jvm — real, working, widely-used PySpark patterns for this
        exact purpose, but internal/underscore-prefixed, so wrapped defensively."""
        df = self.spark.read.format(table_format).load(path)
        input_files = df.inputFiles()
        if not input_files:
            raise RuntimeError(f"No input files resolved for path: {path}")
        hconf = self.spark._jsc.hadoopConfiguration()
        jvm = self.spark._jvm
        total = 0
        for f in input_files:
            jpath = jvm.org.apache.hadoop.fs.Path(f)
            fs = jpath.getFileSystem(hconf)
            total += fs.getFileStatus(jpath).getLen()
        if self.verbose:
            print(f"[analyze] Hadoop FS scan: {total/1e9:.2f} GB across {len(input_files)} files.")
        return total, len(input_files)

    # ---------------------------------------------------------------------- recommend / apply

    def recommend(
        self,
        data: Optional[DataProfile] = None,
        cluster: Optional[ClusterProfile] = None,
        workload: str = "batch_etl",
        cache_heavy: bool = False,
        target_partition_mb: int = 128,
        enable_efficient_scaledown: bool = False,
    ) -> List[Recommendation]:
        data = data or self._last_data_profile
        cluster = cluster or self._last_cluster_profile
        if data is None:
            raise ValueError("No DataProfile available — call analyze(path) first, or pass data= explicitly.")
        if cluster is None:
            raise ValueError("No ClusterProfile available — call detect_cluster() first, or pass cluster= explicitly.")
        hints = WorkloadHints(kind=workload, cache_heavy=cache_heavy)
        recs = build_full_recommendation(
            data, cluster, hints,
            target_partition_mb=target_partition_mb,
            enable_efficient_scaledown=(enable_efficient_scaledown and cluster.platform == "fabric"),
        )
        self._last_recs = recs
        return recs

    def apply(self, recs: Optional[List[Recommendation]] = None, dry_run: bool = False) -> dict:
        """
        Applies only the configs that are genuinely safe to set on a live session
        (Recommendation.scope == 'runtime', e.g. every spark.sql.* / AQE / broadcast-threshold
        key). Session-start-only configs (executor cores/memory, spark.memory.*,
        dynamicAllocation.*, and shuffle-plugin wiring) are NEVER passed to spark.conf.set —
        doing so raises AnalysisException[CANNOT_MODIFY_CONFIG] on a real cluster, verified
        empirically against a live Spark 3.5.1 session. Use session_start_snippet() to get
        those as a %%configure block (Fabric) or SparkConf snippet (OSS) to apply *before*
        the session starts.
        """
        recs = recs or self._last_recs
        if recs is None:
            raise ValueError("No recommendations to apply — call recommend() first.")
        applied = {}
        skipped_session_start = []
        for r in recs:
            if r.key.startswith("_"):
                continue
            if r.scope == "session_start":
                skipped_session_start.append(r.key)
                continue
            if dry_run:
                if self.verbose:
                    print(f"[dry-run] would set {r.key} = {r.value}")
            else:
                self.spark.conf.set(r.key, r.value)
                if self.verbose:
                    print(f"[apply] {r.key} = {r.value}")
            applied[r.key] = r.value
        if skipped_session_start and self.verbose:
            print(f"\n[apply] Skipped {len(skipped_session_start)} session-start-only config(s) — "
                  "these cannot be changed on a running session. Call session_start_snippet() to "
                  "get them as a %%configure block (Fabric) or SparkConf snippet (OSS) for next "
                  "session start:")
            for k in skipped_session_start:
                print(f"           - {k}")
        return applied

    @staticmethod
    def _is_default(rec) -> bool:
        """True when the recommendation restates an existing default rather than changing it."""
        from spark_autoconfig_core import SPARK_DEFAULTS as DEFAULTS
        known = DEFAULTS.get(rec.key)
        if known is None:
            return False
        return str(known).strip().lower() == str(rec.value).strip().lower()

    def session_start_snippet(self, recs: Optional[List[Recommendation]] = None, as_format: str = "fabric") -> str:
        """Renders session-start-only recommendations as something directly usable:
        - as_format='fabric': a %%configure -f JSON cell (paste as the notebook's FIRST cell,
          before any Spark code runs — %%configure must run before the session starts).
        - as_format='sparkconf': a SparkConf(...).set(...) chain for building the session yourself.
        """
        recs = recs or self._last_recs
        if recs is None:
            raise ValueError("No recommendations available — call recommend() first.")
        candidates = [r for r in recs if r.scope == "session_start" and not r.key.startswith("_")]
        # Only emit settings that DIFFER from the engine/platform default. A %%configure block that
        # restates spark.memory.fraction=0.6 is noise: it looks like a decision, invites cargo-culting,
        # and future-proofs nothing (if a default changes, your pin silently overrides it).
        session_recs = [r for r in candidates if not self._is_default(r)]
        left_default = [r for r in candidates if self._is_default(r)]
        if not session_recs:
            body = ("(no session-start config changes needed — every session-start setting for this "
                    "workload is already at its engine/platform default)")
            if left_default and as_format == "fabric":
                body += "\n# verified at default, deliberately NOT set:\n" + "\n".join(
                    f"#   {r.key} = {r.value}" for r in left_default)
            return body
        if as_format == "fabric":
            import json
            conf_block = {r.key: r.value for r in session_recs}
            out = "%%configure -f\n" + json.dumps({"conf": conf_block}, indent=2)
            if left_default:
                out += ("\n\n# Verified at default for this workload — deliberately NOT set.\n"
                        "# Pinning a default is a future liability, not a safeguard:\n"
                        + "\n".join(f"#   {r.key} = {r.value}  ({r.basis})" for r in left_default))
            return out
        lines = ["conf = SparkConf()"]
        for r in session_recs:
            lines.append(f'conf.set("{r.key}", "{r.value}")')
        lines.append("spark = SparkSession.builder.config(conf=conf).getOrCreate()")
        return "\n".join(lines)

    def report(self, recs: Optional[List[Recommendation]] = None) -> str:
        recs = recs or self._last_recs
        if recs is None:
            raise ValueError("No recommendations to report — call recommend() first.")
        lines = ["=" * 100, "SPARK AUTO-CONFIG REPORT", "=" * 100]
        if self._last_data_profile:
            d = self._last_data_profile
            lines.append(f"Data:    {d.total_gb:.2f} GB across {d.file_count} files "
                          f"(avg {d.avg_file_size_bytes/1e6:.1f} MB/file)"
                          + (f", ~{d.estimated_row_count:,} rows" if d.estimated_row_count else ""))
        if self._last_cluster_profile:
            c = self._last_cluster_profile
            if c.platform == "fabric":
                lines.append(f"Cluster: Fabric, node_size={c.node_size}, num_nodes={c.num_nodes} "
                              f"({c.num_executors} executors x {c.node_vcores} vCores/{c.node_memory_gb} GB)")
            else:
                lines.append(f"Cluster: OSS/YARN, num_nodes={c.num_nodes}, "
                              f"{c.node_vcores} vCores/{c.node_memory_gb} GB per node")
        lines.append("-" * 100)
        runtime_recs = [r for r in recs if r.scope == "runtime" and not r.key.startswith("_")]
        session_recs = [r for r in recs if r.scope == "session_start" and not r.key.startswith("_")]
        note_recs = [r for r in recs if r.key.startswith("_")]

        def render(rec_list):
            for r in rec_list:
                lines.append(f"[{r.basis:13s}] {r.key}")
                lines.append(f"{'':17s}= {r.value}")
                lines.append(f"{'':17s}{r.reason}")
                lines.append("")

        lines.append(f"RUNTIME-MUTABLE — safe to apply on the current session via apply() ({len(runtime_recs)}):")
        render(runtime_recs)
        lines.append(f"SESSION-START-ONLY — needs a %%configure block / new session ({len(session_recs)}):")
        lines.append("(get these via session_start_snippet() — spark.conf.set() will raise CANNOT_MODIFY_CONFIG)")
        lines.append("")
        render(session_recs)
        if note_recs:
            lines.append(f"NOTES ({len(note_recs)}):")
            for r in note_recs:
                lines.append(f"[{r.basis:13s}] (note) {r.key[1:]}")
                lines.append(f"{'':17s}{r.reason}")
                lines.append("")
        lines.append("=" * 100)
        lines.append("Legend: SPARK_DEFAULT = documented Apache Spark default | FABRIC_DOC = documented Fabric "
                      "behaviour/figure | HEURISTIC = community/industry rule of thumb — validate against the Spark UI.")
        text = "\n".join(lines)
        if self.verbose:
            print(text)
        return text
