"""
spark_eventlog_analyzer.py
===========================
Download and analyse Spark event logs from Microsoft Fabric — or any Spark event log file.

WHY EVENT LOGS: the Spark UI and the monitoring REST APIs give you aggregates. The event log is
the raw ground truth — every task, every stage, every accumulator, every executor lifecycle event
that the UI is *rendered from*. If you want analysis the UI does not offer (per-key skew ratios,
spill attribution, executor idle time, stage critical path), the event log is the only source.

THREE ENTRY POINTS
  1. from_fabric_url(url)  - paste ANY Fabric URL (portal, monitoring, or API). It is parsed and
                             normalised into the correct REST endpoint. Handles the common
                             "bad URL" failures explicitly rather than 400-ing.
  2. from_ids(...)         - supply workspace/item/livy/app ids directly.
  3. from_file(path)       - a downloaded event log: plain JSON-lines, .gz, .zip, or a directory.

NOTHING IS HARDCODED: every metric is derived from the actual event stream. Feed it a different
application and it reports that application. The analysis functions read Spark's documented event
schema (SparkListenerTaskEnd, SparkListenerStageCompleted, ...), not fixture data.

Tested end-to-end against a real event log produced by Spark 3.5 (see nb_eventlog_analysis).
"""

from __future__ import annotations
import json, os, re, gzip, zipfile, io, statistics
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Iterable, Any

# ---------------------------------------------------------------- URL handling

FABRIC_API = "https://api.fabric.microsoft.com"
_GUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
ITEM_KINDS = ("notebooks", "sparkJobDefinitions", "lakehouses")


class UrlProblem(ValueError):
    """Raised with an explanation of WHICH part of the URL is wrong and how to fix it."""


@dataclass
class SparkAppRef:
    workspace_id: str
    item_kind: str
    item_id: str
    livy_id: str
    app_id: str
    attempt_id: int = 1

    def logs_url(self) -> str:
        """Event-log download endpoint (returns a zip of event log files)."""
        return (f"{FABRIC_API}/v1/workspaces/{self.workspace_id}/{self.item_kind}/{self.item_id}"
                f"/livySessions/{self.livy_id}/applications/{self.app_id}/{self.attempt_id}/logs")

    def api_url(self, endpoint: str) -> str:
        """Any Spark History Server-compatible endpoint: jobs, stages, executors, environment..."""
        return (f"{FABRIC_API}/v1/workspaces/{self.workspace_id}/{self.item_kind}/{self.item_id}"
                f"/livySessions/{self.livy_id}/applications/{self.app_id}/{self.attempt_id}/{endpoint}")

    def as_dict(self):
        return dict(workspace_id=self.workspace_id, item_kind=self.item_kind, item_id=self.item_id,
                    livy_id=self.livy_id, app_id=self.app_id, attempt_id=self.attempt_id)


def resolve_spark_rest_url(url: str, endpoint: str = "logs", item_kind_hint: str = "notebooks") -> str:
    """Convenience helper: parse ANY Fabric portal or monitoring URL and return the requested REST API URL."""
    ref = parse_fabric_url(url, item_kind_hint=item_kind_hint)
    return ref.logs_url() if endpoint == "logs" else ref.api_url(endpoint)


def parse_fabric_url(url: str, item_kind_hint: str = "notebooks") -> SparkAppRef:
    """Normalise ANY Fabric URL into a SparkAppRef.

    This is the fix for "bad URL". The five failures that actually happen:
      1. Pasting the PORTAL url (app.powerbi.com / app.fabric.microsoft.com) instead of the API url.
         The portal url contains the ids - we extract them rather than rejecting it.
      2. Omitting /{attemptId}/ - the logs endpoint requires it (usually 1). Without it you get
         a 400/404 that does not say so.
      3. Wrong item segment - a Spark Job Definition's app under /notebooks/ 404s. We detect the
         kind from the url when present, else use the hint.
      4. Trailing junk: query strings, #fragments, copied whitespace, a trailing slash.
      5. Application id with the wrong shape (e.g. the Livy id pasted twice).
    """
    if not url or not url.strip():
        raise UrlProblem("Empty URL. Paste either the Monitoring-hub application URL or the "
                         "REST API URL, or use from_ids() with the ids from Recent runs.")
    raw = url.strip().strip('"').strip("'")
    # (4) Strip fragment/trailing slash for PATH matching, but keep the query string for id
    # extraction - portal URLs carry sessionId/appId as query parameters, so discarding the
    # query before scanning would throw away the very ids we need.
    scan = raw.replace("&", " ").replace("=", " ")          # flatten query params for scanning
    u = raw.split("#")[0].split("?")[0].rstrip("/")

    guids = re.findall(_GUID, u) or re.findall(_GUID, scan)
    if len(guids) < 3:
        # top up from the query string, preserving order and uniqueness
        for g in re.findall(_GUID, scan):
            if g not in guids:
                guids.append(g)
    # item kind, if the url states it
    kind = next((k for k in ITEM_KINDS if f"/{k}/" in u), None)

    # application id: Spark's own format, or Fabric's livy-ish application id
    app_m = re.search(r"(application_\d+_\d+)", raw)   # search the FULL url incl. query
    app_id = app_m.group(1) if app_m else None

    # explicit REST shape: .../workspaces/{ws}/{kind}/{item}/livySessions/{livy}/applications/{app}[/{attempt}]
    m = re.search(rf"/workspaces/({_GUID})/({'|'.join(ITEM_KINDS)})/({_GUID})"
                  rf"/livySessions/({_GUID})/applications/([^/]+)(?:/(\d+))?", u)
    if m:
        return SparkAppRef(workspace_id=m.group(1), item_kind=m.group(2), item_id=m.group(3),
                           livy_id=m.group(4), app_id=m.group(5),
                           attempt_id=int(m.group(6)) if m.group(6) else 1)   # (2) default attempt

    # portal / monitoring-hub shape: ids present but not in REST order
    if len(guids) >= 3 and app_id:
        return SparkAppRef(workspace_id=guids[0], item_kind=kind or item_kind_hint,
                           item_id=guids[1], livy_id=guids[2], app_id=app_id)

    # diagnose precisely instead of failing vaguely
    missing = []
    if len(guids) < 3:
        missing.append(f"expected 3 GUIDs (workspace, item, livySession) but found {len(guids)}")
    if not app_id:
        missing.append("no application id of the form application_<epoch>_<seq> found")
    raise UrlProblem(
        "Could not parse a Spark application reference from that URL.\n"
        f"  Problems: {'; '.join(missing)}.\n"
        "  Expected either:\n"
        "    (a) the REST form  .../v1/workspaces/{ws}/notebooks/{item}/livySessions/{livy}"
        "/applications/{appId}/1/logs\n"
        "    (b) a Monitoring-hub URL containing the same ids\n"
        "  Or call from_ids(workspace_id=..., item_id=..., livy_id=..., app_id=...) using the\n"
        "  Livy Id and Application Id shown on the Recent runs page.")


# ---------------------------------------------------------------- event log loading

def _iter_json_lines(raw: bytes) -> Iterable[dict]:
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue      # event logs can end mid-write on a killed application


def load_events(path: str) -> List[dict]:
    """Load events from a file (plain / .gz / .zip) or a directory of such files."""
    events: List[dict] = []
    paths = []
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            paths += [os.path.join(root, f) for f in files]
    else:
        paths = [path]
    for p in paths:
        if p.endswith(".zip"):
            with zipfile.ZipFile(p) as z:
                for name in z.namelist():
                    if name.endswith("/"):
                        continue
                    data = z.read(name)
                    if name.endswith(".gz"):
                        data = gzip.decompress(data)
                    events += list(_iter_json_lines(data))
        elif p.endswith(".gz"):
            events += list(_iter_json_lines(gzip.open(p, "rb").read()))
        else:
            events += list(_iter_json_lines(open(p, "rb").read()))
    return events


def download_event_log(ref: SparkAppRef, out_path: str, client=None) -> str:
    """Download the event log zip for a Fabric Spark application.
    `client` = a Fabric REST client (sempy FabricRestClient) or anything with .get(url).
    Not exercised in the local test suite - it needs a live Fabric session."""
    url = ref.logs_url()
    if client is None:
        try:
            from sempy.fabric import FabricRestClient
            client = FabricRestClient()
        except ImportError as e:
            raise RuntimeError(
                "No REST client available. Inside a Fabric notebook sempy provides one; "
                "outside Fabric pass client=<something with .get(url)> holding an Entra token."
            ) from e
    resp = client.get(url)
    code = getattr(resp, "status_code", 200)
    if code != 200:
        raise UrlProblem(
            f"HTTP {code} from {url}\n"
            "  Common causes, in order of likelihood:\n"
            "   - attemptId missing or wrong (this URL uses /{}/ - try 1, or 2 after a retry)\n"
            "   - item kind mismatch: the app belongs to a sparkJobDefinition or lakehouse,\n"
            "     not a notebook (change item_kind)\n"
            "   - the application id is from a different Livy session\n"
            "   - the session is still running (event logs finalise on completion)\n"
            "   - caller lacks read permission on the item".format(ref.attempt_id))
    content = getattr(resp, "content", resp)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as fh:
        fh.write(content)
    return out_path


# ---------------------------------------------------------------- analysis

@dataclass
class Finding:
    code: str
    severity: str
    scope: str
    message: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    fix: str = ""


class EventLogAnalysis:
    """Derives everything from the raw event stream. No fixtures, no assumptions about which
    application this is."""

    def __init__(self, events: List[dict]):
        self.events = events
        self.app = {}
        self.jobs: Dict[int, dict] = {}
        self.stages: Dict[tuple, dict] = {}
        self.tasks: Dict[tuple, List[dict]] = {}
        self.executors: Dict[str, dict] = {}
        self.sql: Dict[int, dict] = {}
        self.conf: Dict[str, str] = {}
        self._parse()

    # ---- parsing (Spark's documented event schema) ----
    def _parse(self):
        for e in self.events:
            ev = e.get("Event", "")
            if ev == "SparkListenerApplicationStart":
                self.app.update(name=e.get("App Name"), app_id=e.get("App ID"),
                                start=e.get("Timestamp"), user=e.get("User"))
            elif ev == "SparkListenerApplicationEnd":
                self.app["end"] = e.get("Timestamp")
            elif ev == "SparkListenerEnvironmentUpdate":
                self.conf = dict(e.get("Spark Properties", {}) or {})
            elif ev == "SparkListenerJobStart":
                self.jobs[e["Job ID"]] = {
                    "job_id": e["Job ID"], "start": e.get("Submission Time"),
                    "stage_ids": e.get("Stage IDs", []),
                    "job_group": (e.get("Properties") or {}).get("spark.jobGroup.id"),
                    "callsite": (e.get("Properties") or {}).get("callSite.short"),
                    "sql_exec_id": (e.get("Properties") or {}).get("spark.sql.execution.id"),
                }
            elif ev == "SparkListenerJobEnd":
                j = self.jobs.setdefault(e["Job ID"], {"job_id": e["Job ID"]})
                j["end"] = e.get("Completion Time")
                j["result"] = (e.get("Job Result") or {}).get("Result")
            elif ev == "SparkListenerStageCompleted":
                si = e.get("Stage Info", {})
                key = (si.get("Stage ID"), si.get("Stage Attempt ID", 0))
                self.stages[key] = {
                    "stage_id": si.get("Stage ID"), "attempt": si.get("Stage Attempt ID", 0),
                    "name": si.get("Stage Name"), "num_tasks": si.get("Number of Tasks"),
                    "submit": si.get("Submission Time"), "complete": si.get("Completion Time"),
                    "failure": si.get("Failure Reason"),
                    "parent_ids": si.get("Parent IDs", []),
                }
            elif ev == "SparkListenerTaskEnd":
                si, ti = e.get("Stage ID"), e.get("Task Info", {})
                m = e.get("Task Metrics", {}) or {}
                sr = m.get("Shuffle Read Metrics", {}) or {}
                sw = m.get("Shuffle Write Metrics", {}) or {}
                key = (si, e.get("Stage Attempt ID", 0))
                self.tasks.setdefault(key, []).append({
                    "task_id": ti.get("Task ID"), "executor": ti.get("Executor ID"),
                    "duration": ti.get("Finish Time", 0) - ti.get("Launch Time", 0),
                    "failed": ti.get("Failed", False),
                    "gc_time": m.get("JVM GC Time", 0),
                    "mem_spill": m.get("Memory Bytes Spilled", 0),
                    "disk_spill": m.get("Disk Bytes Spilled", 0),
                    "peak_mem": m.get("Peak Execution Memory", 0),
                    "input_bytes": (m.get("Input Metrics", {}) or {}).get("Bytes Read", 0),
                    "output_bytes": (m.get("Output Metrics", {}) or {}).get("Bytes Written", 0),
                    "shuffle_read": (sr.get("Remote Bytes Read", 0) or 0) + (sr.get("Local Bytes Read", 0) or 0),
                    "shuffle_write": sw.get("Shuffle Bytes Written", 0),
                    "records_read": (m.get("Input Metrics", {}) or {}).get("Records Read", 0)
                                    or sr.get("Total Records Read", 0),
                    "reason": (e.get("Task End Reason") or {}).get("Reason"),
                })
            elif ev == "SparkListenerExecutorAdded":
                self.executors[e.get("Executor ID")] = {
                    "added": e.get("Timestamp"),
                    "cores": (e.get("Executor Info") or {}).get("Total Cores"),
                    "host": (e.get("Executor Info") or {}).get("Host"),
                }
            elif ev == "SparkListenerExecutorRemoved":
                self.executors.setdefault(e.get("Executor ID"), {})["removed"] = e.get("Timestamp")
                self.executors.setdefault(e.get("Executor ID"), {})["reason"] = e.get("Removed Reason")
            elif ev.endswith("SparkListenerSQLExecutionStart"):
                self.sql[e.get("executionId")] = {
                    "exec_id": e.get("executionId"), "description": e.get("description"),
                    "details": e.get("details"), "start": e.get("time"),
                    "plan": e.get("physicalPlanDescription", ""),
                }
            elif ev.endswith("SparkListenerSQLExecutionEnd"):
                self.sql.setdefault(e.get("executionId"), {})["end"] = e.get("time")

    # ---- derived views ----
    def job_table(self) -> List[dict]:
        out = []
        for j in self.jobs.values():
            dur = (j.get("end", 0) - j.get("start", 0)) / 1000 if j.get("end") and j.get("start") else None
            st = [self.stages[k] for k in self.stages if self.stages[k]["stage_id"] in j.get("stage_ids", [])]
            tasks = [t for k in self.tasks if k[0] in j.get("stage_ids", []) for t in self.tasks[k]]
            out.append({**j, "duration_s": dur, "num_stages": len(st), "num_tasks": len(tasks),
                        "shuffle_read_mb": sum(t["shuffle_read"] for t in tasks) / 1048576,
                        "shuffle_write_mb": sum(t["shuffle_write"] for t in tasks) / 1048576,
                        "spill_mb": sum(t["mem_spill"] + t["disk_spill"] for t in tasks) / 1048576})
        return sorted(out, key=lambda x: -(x["duration_s"] or 0))

    def stage_table(self) -> List[dict]:
        out = []
        for key, s in self.stages.items():
            tasks = self.tasks.get(key, [])
            durs = [t["duration"] for t in tasks] or [0]
            med = statistics.median(durs)
            out.append({**s,
                        "wall_s": ((s.get("complete") or 0) - (s.get("submit") or 0)) / 1000,
                        "task_count": len(tasks),
                        "max_task_ms": max(durs), "median_task_ms": med,
                        "skew_ratio": (max(durs) / med) if med else 1.0,
                        "spill_mb": sum(t["mem_spill"] + t["disk_spill"] for t in tasks) / 1048576,
                        "shuffle_read_mb": sum(t["shuffle_read"] for t in tasks) / 1048576,
                        "shuffle_write_mb": sum(t["shuffle_write"] for t in tasks) / 1048576,
                        "gc_ms": sum(t["gc_time"] for t in tasks),
                        "task_time_ms": sum(durs),
                        "failed_tasks": sum(1 for t in tasks if t["failed"])})
        return sorted(out, key=lambda x: -x["wall_s"])

    # ---- findings: thresholds are parameters, logic is derived ----
    def findings(self, skew_ratio=3.0, spill_mb=64, gc_pct=10.0,
                 tiny_task_ms=500, tiny_task_count=200) -> List[Finding]:
        f: List[Finding] = []
        for s in self.stage_table():
            sid = f"stage {s['stage_id']}.{s['attempt']}"
            if s["task_count"] >= 4 and s["skew_ratio"] >= skew_ratio:
                f.append(Finding("E-SKEW", "critical", sid,
                    f"Task duration skew {s['skew_ratio']:.1f}x (max {s['max_task_ms']}ms vs median {s['median_task_ms']:.0f}ms)",
                    {"max_ms": s["max_task_ms"], "median_ms": s["median_task_ms"], "tasks": s["task_count"]},
                    "One task dominates the stage. If it is a join, confirm AQE skew-join is on; "
                    "for aggregation skew, salt the key. Check whether the hot key is NULL."))
            if s["spill_mb"] >= spill_mb:
                f.append(Finding("E-SPILL", "critical", sid,
                    f"{s['spill_mb']:.0f} MB spilled (memory+disk)",
                    {"spill_mb": round(s["spill_mb"], 1)},
                    "Partitions exceed per-core execution memory. Lower advisoryPartitionSizeInBytes, "
                    "or reduce executor cores so each task gets more memory."))
            if s["task_time_ms"] > 0 and (s["gc_ms"] / s["task_time_ms"] * 100) >= gc_pct:
                f.append(Finding("E-GC", "warn", sid,
                    f"GC is {s['gc_ms'] / s['task_time_ms'] * 100:.0f}% of task time",
                    {"gc_ms": s["gc_ms"], "task_ms": s["task_time_ms"]},
                    "Heap pressure. Usually the same root cause as spill; check object churn "
                    "(wide strings, large collections) before adding memory."))
            if s["task_count"] >= tiny_task_count and s["median_task_ms"] <= tiny_task_ms:
                f.append(Finding("E-TINY", "warn", sid,
                    f"{s['task_count']} tasks with median {s['median_task_ms']:.0f}ms - scheduling overhead dominates",
                    {"tasks": s["task_count"], "median_ms": s["median_task_ms"]},
                    "Over-partitioned or small-file bound. Compact the source (OPTIMIZE) and let "
                    "AQE coalesce; do not hand-set large shuffle partition counts for small data."))
            if s["failed_tasks"]:
                f.append(Finding("E-FAIL", "critical", sid,
                    f"{s['failed_tasks']} failed task(s)",
                    {"failed": s["failed_tasks"]},
                    "Inspect the task end reasons; FetchFailed points at executor loss (enable "
                    "Efficient Scaledown), OOM at memory sizing."))
        # executor-level
        for eid, ex in self.executors.items():
            if ex.get("reason") and "idle" not in str(ex.get("reason", "")).lower():
                f.append(Finding("E-EXEC", "warn", f"executor {eid}",
                    f"Removed: {str(ex.get('reason'))[:120]}", {"executor": eid},
                    "Non-idle executor loss costs shuffle blocks and stage retries."))
        return f

    def critical_path(self) -> List[dict]:
        """Stages ranked by wall time - where the job actually spent its life."""
        st = self.stage_table()
        total = sum(s["wall_s"] for s in st) or 1
        return [{**s, "pct_of_stage_time": s["wall_s"] / total * 100} for s in st]

    def summary(self) -> dict:
        st = self.stage_table()
        tasks = [t for v in self.tasks.values() for t in v]
        dur = None
        if self.app.get("start") and self.app.get("end"):
            dur = (self.app["end"] - self.app["start"]) / 1000
        return {
            "app_name": self.app.get("name"), "app_id": self.app.get("app_id"),
            "duration_s": dur, "jobs": len(self.jobs), "stages": len(self.stages),
            "tasks": len(tasks),
            "total_shuffle_read_mb": round(sum(t["shuffle_read"] for t in tasks) / 1048576, 1),
            "total_shuffle_write_mb": round(sum(t["shuffle_write"] for t in tasks) / 1048576, 1),
            "total_spill_mb": round(sum(t["mem_spill"] + t["disk_spill"] for t in tasks) / 1048576, 1),
            "total_input_mb": round(sum(t["input_bytes"] for t in tasks) / 1048576, 1),
            "executors": len(self.executors),
            "sql_executions": len(self.sql),
            "aqe_enabled": self.conf.get("spark.sql.adaptive.enabled"),
            "nee_enabled": self.conf.get("spark.native.enabled"),
            "ansi_enabled": self.conf.get("spark.sql.ansi.enabled"),
            "shuffle_partitions": self.conf.get("spark.sql.shuffle.partitions"),
        }

    def report(self) -> str:
        s = self.summary()
        lines = [f"EVENT LOG ANALYSIS - {s['app_name']} ({s['app_id']})", "=" * 72]
        lines.append(f"duration={s['duration_s']}s  jobs={s['jobs']}  stages={s['stages']}  "
                     f"tasks={s['tasks']}  executors={s['executors']}")
        lines.append(f"shuffle read={s['total_shuffle_read_mb']}MB  write={s['total_shuffle_write_mb']}MB  "
                     f"spill={s['total_spill_mb']}MB  input={s['total_input_mb']}MB")
        lines.append(f"config: AQE={s['aqe_enabled']}  NEE={s['nee_enabled']}  ANSI={s['ansi_enabled']}  "
                     f"shuffle.partitions={s['shuffle_partitions']}")
        lines.append("")
        lines.append("SLOWEST STAGES (critical path)")
        for st in self.critical_path()[:5]:
            lines.append(f"  stage {st['stage_id']}.{st['attempt']:<2} {st['wall_s']:>7.1f}s "
                         f"({st['pct_of_stage_time']:>4.1f}%)  tasks={st['task_count']:<5} "
                         f"skew={st['skew_ratio']:>4.1f}x  spill={st['spill_mb']:>6.0f}MB  "
                         f"{(st['name'] or '')[:44]}")
        fs = self.findings()
        lines.append("")
        lines.append(f"FINDINGS ({sum(1 for x in fs if x.severity=='critical')} critical, "
                     f"{sum(1 for x in fs if x.severity=='warn')} warn)")
        if not fs:
            lines.append("  none - no skew, spill, GC pressure, tiny-task or failure signatures found.")
        for x in sorted(fs, key=lambda y: 0 if y.severity == "critical" else 1):
            lines.append(f"  [{x.code}/{x.severity}] {x.scope}: {x.message}")
            lines.append(f"      fix: {x.fix}")
        return "\n".join(lines)


# ---------------------------------------------------------------- entry points

def from_file(path: str) -> EventLogAnalysis:
    ev = load_events(path)
    if not ev:
        raise ValueError(f"No parseable Spark events found in {path}. An event log is JSON-lines; "
                         f"check you downloaded the event log rather than a driver stdout file.")
    return EventLogAnalysis(ev)


def from_fabric_url(url: str, out_dir: str = "/tmp/spark_eventlogs", client=None,
                    item_kind_hint: str = "notebooks") -> EventLogAnalysis:
    ref = parse_fabric_url(url, item_kind_hint)
    dest = os.path.join(out_dir, f"{ref.app_id}_{ref.attempt_id}.zip")
    download_event_log(ref, dest, client)
    return from_file(dest)


def from_ids(workspace_id, item_id, livy_id, app_id, attempt_id=1,
             item_kind="notebooks", out_dir="/tmp/spark_eventlogs", client=None) -> EventLogAnalysis:
    ref = SparkAppRef(workspace_id, item_kind, item_id, livy_id, app_id, attempt_id)
    dest = os.path.join(out_dir, f"{app_id}_{attempt_id}.zip")
    download_event_log(ref, dest, client)
    return from_file(dest)
