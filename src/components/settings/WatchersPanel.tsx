import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty, Panel } from "@/components/settings/shared";
import {
  addSourceWatcher,
  deleteSourceWatcher,
  listSourceWatchers,
  pollSourceWatchers,
  rescanSourceWatcher,
  setSourceWatcherStatus,
  testSourceWatcher,
  updateSourceWatcher,
} from "@/lib/settings.functions";

export type WatcherRow = {
  id: string;
  url: string;
  title: string;
  mode: string;
  detected_mode: string | null;
  detected_url: string | null;
  alternative_url: string | null;
  status: "active" | "paused";
  default_tier: number;
  default_tags: string[];
  last_attempt_at: string | null;
  last_success_at: string | null;
  error_count: number;
  last_error_code: string | null;
  last_error: string;
  last_error_trigger: string | null;
  suggested_url: string | null;
  tracked_count?: number;
  open_queue_count?: number;
};

type PollOutcome = {
  watcher: string;
  queued: number;
  skipped: number;
  discovered: number;
  attempts?: { outcome: string }[];
  error?: { message: string } | null;
};

const REMEDIATION: Record<string, string> = {
  blocked:
    "Site returned an anti-bot challenge. Try setting an alternative URL to a first-party RSS feed (e.g. /feed) or sitemap (/sitemap.xml) — auto-fallback probes these on retry. If the whole domain challenges server traffic, poll it from your machine instead: node scripts/poll-watchers.mjs routes new posts into content/queue.md.",
  robots_denied: "robots.txt disallows this path. Point the watcher at an allowed path or feed.",
  timeout: "The request timed out. The site may be slow; retry, or use a lighter feed URL.",
  invalid_content: "Response was invalid or too large. Configure a smaller first-party feed.",
  parse_failure: "Response didn't match the selected mode. Try mode=auto or switch to rss/sitemap.",
  http: "HTTP error from the origin. Check the URL is reachable, then retry.",
};
const remediation = (code: string | null) => (code ? (REMEDIATION[code] ?? null) : null);

/** Turn raw poll counters into a sentence an admin can act on. */
export function explainPollResult(result: PollOutcome): string {
  if (result.error) return `${result.watcher}: failed — ${result.error.message}`;
  if (result.queued > 0)
    return `${result.watcher}: ${result.queued} new item(s) added to the ingestion queue.`;
  if ((result.attempts ?? []).some((a) => a.outcome === "unchanged"))
    return `${result.watcher}: up to date — the site returned 304 Not Modified since the last poll, so there are no new posts. Use "Force re-scan" to re-read the feed anyway.`;
  if (result.skipped > 0)
    return `${result.watcher}: ${result.skipped} item(s) seen, all already queued or already ingested — nothing new.`;
  return `${result.watcher}: no items found for the configured scope.`;
}

export function WatchersPanel() {
  const listFn = useServerFn(listSourceWatchers),
    addFn = useServerFn(addSourceWatcher),
    testFn = useServerFn(testSourceWatcher),
    updateFn = useServerFn(updateSourceWatcher),
    pollFn = useServerFn(pollSourceWatchers),
    rescanFn = useServerFn(rescanSourceWatcher),
    statusFn = useServerFn(setSourceWatcherStatus),
    deleteFn = useServerFn(deleteSourceWatcher);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["source-watchers"], queryFn: () => listFn() });
  const [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [alternative, setAlternative] = useState(""),
    [tier, setTier] = useState("6"),
    [tags, setTags] = useState(""),
    [editingId, setEditingId] = useState<string | null>(null),
    [pollSummary, setPollSummary] = useState<string[] | null>(null),
    [testResult, setTestResult] = useState<any>(null);
  const payload = () => ({
    url: url.trim(),
    title: title.trim(),
    mode: "auto" as const,
    alternativeUrl: alternative.trim() || undefined,
    defaultTier: Number(tier),
    defaultTags: tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["source-watchers"] });
    void qc.invalidateQueries({ queryKey: ["suggested-actions"] });
  };
  const resetForm = () => {
    setUrl("");
    setTitle("");
    setAlternative("");
    setTier("6");
    setTags("");
    setEditingId(null);
    setTestResult(null);
  };
  const beginEdit = (watcher: WatcherRow) => {
    setUrl(watcher.url);
    setTitle(watcher.title);
    setAlternative(watcher.alternative_url || "");
    setTier(String(watcher.default_tier));
    setTags((watcher.default_tags || []).join(", "));
    setEditingId(watcher.id);
  };
  const test = useMutation({
    mutationFn: () => {
      setTestResult(null);
      return testFn({ data: payload() });
    },
    onSuccess: (r) => {
      if (r.ok) {
        setTestResult(r);
        toast.success(`Auto detected ${r.mode}: ${r.discovered} URL(s), ${r.fetched} fetch(es).`);
        return;
      }
      toast.error(
        [
          r.error,
          r.trigger && `Triggered: ${r.trigger}.`,
          r.suggestedUrl && `Try ${r.suggestedUrl}`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      setTestResult({ attempts: r.attempts ?? [], failed: true });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const add = useMutation({
    mutationFn: () => addFn({ data: payload() }),
    onSuccess: () => {
      toast.success("Watcher added.");
      resetForm();
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const update = useMutation({
    mutationFn: () => updateFn({ data: { id: editingId!, ...payload() } }),
    onSuccess: () => {
      toast.success("Watcher updated.");
      resetForm();
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const applyPollResult = (r: { results: PollOutcome[]; totalQueued: number }) => {
    const failed = r.results.filter((x) => x.error).length;
    setPollSummary(r.results.map((x) => explainPollResult(x)));
    toast[failed ? "warning" : "success"](
      r.results.length === 1
        ? explainPollResult(r.results[0])
        : `${r.totalQueued} new item(s) queued; ${failed} watcher(s) failed.`,
    );
    invalidate();
  };
  const poll = useMutation({
    mutationFn: (watcherId?: string) => pollFn({ data: watcherId ? { watcherId } : {} }),
    onSuccess: (r) => applyPollResult(r as any),
    onError: (e) => toast.error((e as Error).message),
  });
  const rescan = useMutation({
    mutationFn: (id: string) => rescanFn({ data: { id } }),
    onSuccess: (r) => applyPollResult(r as any),
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: (r: WatcherRow) =>
      statusFn({ data: { id: r.id, status: r.status === "active" ? "paused" : "active" } }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });
  const rows = (query.data?.watchers ?? []) as WatcherRow[];
  return (
    <Panel title="Website watchers">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Monitor RSS/Atom or JSON feeds, sitemaps, listing pages, and individual pages. New and
          meaningfully changed sources enter the human-reviewed ingestion queue.
        </p>
        <Button
          size="sm"
          onClick={() => poll.mutate(undefined)}
          disabled={poll.isPending || !rows.some((r) => r.status === "active")}
        >
          {poll.isPending ? "Polling…" : "Poll all"}
        </Button>
      </div>
      {pollSummary && pollSummary.length > 0 && (
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-medium text-foreground">Last poll outcome</p>
            <Button size="sm" variant="ghost" onClick={() => setPollSummary(null)}>
              Dismiss
            </Button>
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {pollSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-4 grid gap-2 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        {editingId && (
          <p className="text-sm font-medium text-foreground md:col-span-2">Editing watcher</p>
        )}
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Website, feed, or sitemap URL"
          className="md:col-span-2"
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Watcher name"
        />
        <div className="flex items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
          Mode: auto (retained winner + fallbacks)
        </div>
        <Input
          value={alternative}
          onChange={(e) => setAlternative(e.target.value)}
          placeholder="First-party alternative URL (optional)"
          className="md:col-span-2"
        />
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6].map((x) => (
              <SelectItem key={x} value={String(x)}>
                Trust tier {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma separated"
        />
        <div className="flex justify-end gap-2 md:col-span-2">
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => test.mutate()}
            disabled={!url.trim() || test.isPending}
          >
            {test.isPending ? "Testing…" : "Test and detect"}
          </Button>
          <Button
            size="sm"
            onClick={() => (editingId ? update.mutate() : add.mutate())}
            disabled={!url.trim() || add.isPending || update.isPending}
          >
            {add.isPending || update.isPending
              ? "Validating…"
              : editingId
                ? "Validate and save"
                : "Validate and add watcher"}
          </Button>
        </div>
        {testResult && (
          <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3 text-xs md:col-span-2">
            {testResult.failed ? (
              <p className="font-medium text-rose-700 dark:text-rose-200">
                No strategy returned usable in-scope output.
              </p>
            ) : (
              <p className="font-medium text-foreground">
                Winner: auto → {testResult.mode} · {testResult.resolvedUrl}
              </p>
            )}
            <div className="mt-2 space-y-1 text-muted-foreground">
              {(testResult.attempts ?? []).map((attempt: any, index: number) => (
                <p key={`${attempt.mode}-${attempt.url}-${index}`}>
                  {index + 1}. {attempt.mode} · {attempt.outcome} · {attempt.candidates} result(s) ·{" "}
                  {attempt.url}
                  {attempt.error ? ` · ${attempt.error}` : ""}
                </p>
              ))}
            </div>
            {!testResult.failed && (testResult.sample ?? []).length > 0 && (
              <div className="mt-3 border-t border-teal-500/20 pt-2 text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Sample output</p>
                {(testResult.sample ?? []).slice(0, 5).map((item: any) => (
                  <p key={item.url} className="truncate">
                    {item.title || "Untitled"} · {item.url}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {query.isLoading ? (
        <Empty text="Loading watchers…" />
      ) : rows.length === 0 ? (
        <Empty text="No website watchers configured." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-teal-200 hover:underline"
                >
                  {r.title || r.url}
                </a>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline">auto → {r.detected_mode || "detecting"}</Badge>
                  <Badge variant="outline">T{r.default_tier}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
                  <Badge variant="outline">{r.tracked_count ?? 0} tracked</Badge>
                  {(r.open_queue_count ?? 0) > 0 && (
                    <Badge className="border-teal-400/30 bg-teal-500/10 text-teal-200">
                      {r.open_queue_count} in queue
                    </Badge>
                  )}
                  {r.last_error_code && (
                    <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200">
                      {r.last_error_code}
                    </Badge>
                  )}
                </div>
                {r.last_error && (
                  <div className="mt-1 rounded-sm border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                    <p>
                      <span className="font-medium">{r.error_count}× failure:</span> {r.last_error}
                    </p>
                    {r.last_error_trigger && (
                      <p className="mt-1">
                        <span className="font-medium">Protection triggered:</span>{" "}
                        {r.last_error_trigger}
                      </p>
                    )}
                    {r.suggested_url && (
                      <p className="mt-1">
                        Try next:{" "}
                        <a
                          href={r.suggested_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline underline-offset-2"
                        >
                          {r.suggested_url}
                        </a>
                      </p>
                    )}
                    {remediation(r.last_error_code) && (
                      <p className="mt-1 text-rose-300/80">{remediation(r.last_error_code)}</p>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Retained endpoint: {r.detected_url || "not detected"}
                  <br />
                  Last success:{" "}
                  {r.last_success_at ? new Date(r.last_success_at).toLocaleString() : "never"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" onClick={() => beginEdit(r)}>
                  Edit
                </Button>
                {r.status === "active" && (
                  <>
                    <Button
                      size="sm"
                      variant={r.last_error ? "default" : "outline"}
                      onClick={() => poll.mutate(r.id)}
                      disabled={poll.isPending || rescan.isPending}
                    >
                      {r.last_error ? "Retry" : "Poll"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Clear the cached ETag/Last-Modified and re-read the feed in full."
                      onClick={() => rescan.mutate(r.id)}
                      disabled={poll.isPending || rescan.isPending}
                    >
                      {rescan.isPending ? "Re-scanning…" : "Force re-scan"}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(r)}>
                  {r.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove.mutate(r.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
