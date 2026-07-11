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
  setSourceWatcherStatus,
  testSourceWatcher,
} from "@/lib/settings.functions";

export type WatcherRow = {
  id: string;
  url: string;
  title: string;
  mode: string;
  detected_mode: string | null;
  status: "active" | "paused";
  default_tier: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  error_count: number;
  last_error_code: string | null;
  last_error: string;
};

const REMEDIATION: Record<string, string> = {
  blocked:
    "Site returned an anti-bot challenge. Try setting an alternative URL to a first-party RSS feed (e.g. /feed) or sitemap (/sitemap.xml). Auto-fallback probes these on retry.",
  robots_denied: "robots.txt disallows this path. Point the watcher at an allowed path or feed.",
  timeout: "The request timed out. The site may be slow; retry, or use a lighter feed URL.",
  invalid_content: "Response was invalid or too large. Configure a smaller first-party feed.",
  parse_failure: "Response didn't match the selected mode. Try mode=auto or switch to rss/sitemap.",
  http: "HTTP error from the origin. Check the URL is reachable, then retry.",
};
const remediation = (code: string | null) => (code ? REMEDIATION[code] ?? null : null);

export function WatchersPanel() {
  const listFn = useServerFn(listSourceWatchers),
    addFn = useServerFn(addSourceWatcher),
    testFn = useServerFn(testSourceWatcher),
    pollFn = useServerFn(pollSourceWatchers),
    statusFn = useServerFn(setSourceWatcherStatus),
    deleteFn = useServerFn(deleteSourceWatcher);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["source-watchers"], queryFn: () => listFn() });
  const [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [mode, setMode] = useState<"auto" | "rss" | "sitemap" | "listing" | "page">("auto"),
    [alternative, setAlternative] = useState(""),
    [tier, setTier] = useState("6"),
    [tags, setTags] = useState("");
  const payload = () => ({
    url: url.trim(),
    title: title.trim(),
    mode,
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
  const test = useMutation({
    mutationFn: () => testFn({ data: payload() }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Detected ${r.mode}: ${r.discovered} URL(s), ${r.fetched} fetch(es).`)
        : toast.error(r.error),
    onError: (e) => toast.error((e as Error).message),
  });
  const add = useMutation({
    mutationFn: () => addFn({ data: payload() }),
    onSuccess: () => {
      toast.success("Watcher added.");
      setUrl("");
      setTitle("");
      setAlternative("");
      setTags("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const poll = useMutation({
    mutationFn: (watcherId?: string) => pollFn({ data: watcherId ? { watcherId } : {} }),
    onSuccess: (r) => {
      const failed = r.results.filter((x) => x.error).length;
      toast[failed ? "warning" : "success"](
        `${r.totalQueued} queued; ${failed} watcher(s) failed.`,
      );
      invalidate();
    },
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
      <div className="mb-4 grid gap-2 rounded-md border border-border bg-card p-4 md:grid-cols-2">
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
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["auto", "rss", "sitemap", "listing", "page"].map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => test.mutate()}
            disabled={!url.trim() || test.isPending}
          >
            {test.isPending ? "Testing…" : "Test and detect"}
          </Button>
          <Button size="sm" onClick={() => add.mutate()} disabled={!url.trim() || add.isPending}>
            Add watcher
          </Button>
        </div>
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
                  <Badge variant="outline">{r.detected_mode || r.mode}</Badge>
                  <Badge variant="outline">T{r.default_tier}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
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
                    {remediation(r.last_error_code) && (
                      <p className="mt-1 text-rose-300/80">{remediation(r.last_error_code)}</p>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Last success:{" "}
                  {r.last_success_at ? new Date(r.last_success_at).toLocaleString() : "never"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {r.status === "active" && (
                  <Button
                    size="sm"
                    variant={r.last_error ? "default" : "outline"}
                    onClick={() => poll.mutate(r.id)}
                    disabled={poll.isPending}
                  >
                    {r.last_error ? "Retry" : "Poll"}
                  </Button>
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
