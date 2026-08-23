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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addRssSubscription,
  deleteRssSubscription,
  listRssSubscriptions,
  pollRssFeeds,
  setRssSubscriptionStatus,
} from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";

export type RssRow = {
  id: string;
  feed_url: string;
  title: string;
  default_tier: number;
  status: "active" | "paused";
  last_polled_at: string | null;
  error_count: number;
  last_error: string;
};

export function RssPanel() {
  const listFn = useServerFn(listRssSubscriptions);
  const addFn = useServerFn(addRssSubscription);
  const statusFn = useServerFn(setRssSubscriptionStatus);
  const deleteFn = useServerFn(deleteRssSubscription);
  const pollFn = useServerFn(pollRssFeeds);
  const queryClient = useQueryClient();

  const subs = useQuery({ queryKey: ["rss-subscriptions"], queryFn: () => listFn() });
  const [feedUrl, setFeedUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("6");
  const [tags, setTags] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rss-subscriptions"] });

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          feedUrl: feedUrl.trim(),
          title: title.trim() || undefined,
          defaultTier: Number(tier),
          defaultTags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Subscribed. Use Poll now to queue new posts.");
      setFeedUrl("");
      setTitle("");
      setTags("");
      setTier("6");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (row: RssRow) =>
      statusFn({ data: { id: row.id, status: row.status === "active" ? "paused" : "active" } }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subscription removed.");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const poll = useMutation({
    mutationFn: (feedId?: string) => pollFn({ data: feedId ? { feedId } : {} }),
    onSuccess: (res) => {
      const { results = [], totalQueued = 0 } = (res ?? {}) as {
        results?: Array<{ feed: string; error: string | null }>;
        totalQueued?: number;
      };
      const failed = results.filter((r) => r.error).length;
      if (failed > 0) {
        toast.warning(
          `Polled ${results.length} feed(s): ${totalQueued} queued, ${failed} failed. Run /ingest-batch to extract claims.`,
        );
      } else {
        toast.success(
          `Polled ${results.length} feed(s): ${totalQueued} new item(s) queued. Run /ingest-batch to extract claims.`,
        );
      }
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rows = (subs.data as { subscriptions: RssRow[] } | undefined)?.subscriptions ?? [];
  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <Panel title="RSS feed subscriptions">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Subscribe to a blog's RSS/Atom feed (e.g. the Fabric Updates Blog). Polling fetches each
          active feed, dedupes new entries against existing sources and the queue, and adds them as{" "}
          <code className="text-teal-600 dark:text-teal-300">kind=source</code> items — then{" "}
          <code className="text-teal-600 dark:text-teal-300">/ingest-batch</code> extracts cited
          claims. Use <span className="text-foreground">Poll now</span> to run all active feeds, or
          poll a single feed from its row.
        </p>
        <Button
          size="sm"
          onClick={() => poll.mutate(undefined)}
          disabled={poll.isPending || activeCount === 0}
          className="shrink-0"
        >
          {poll.isPending ? "Polling…" : "Poll now"}
        </Button>
      </div>

      <div className="mb-4 grid gap-2 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://…/feed or .../rss"
          className="h-8 border-border bg-card text-foreground md:col-span-2"
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feed name (optional)"
          className="h-8 border-border bg-card text-foreground"
        />
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="h-8 border-border bg-card text-foreground">
            <SelectValue placeholder="Default tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">T1 · Microsoft Learn</SelectItem>
            <SelectItem value="2">T2 · Fabric blog</SelectItem>
            <SelectItem value="3">T3 · MS GitHub</SelectItem>
            <SelectItem value="4">T4 · MVP / community</SelectItem>
            <SelectItem value="5">T5 · Vendor</SelectItem>
            <SelectItem value="6">T6 · Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Default tags, comma separated (optional)"
          className="h-8 border-border bg-card text-foreground md:col-span-2"
        />
        <div className="flex justify-end md:col-span-2">
          <Button
            size="sm"
            onClick={() => add.mutate()}
            disabled={!feedUrl.trim() || add.isPending}
          >
            {add.isPending ? "Subscribing…" : "Subscribe"}
          </Button>
        </div>
      </div>

      {subs.isLoading ? (
        <Empty text="Loading subscriptions..." />
      ) : rows.length === 0 ? (
        <Empty text="No feeds subscribed yet." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Feed</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last polled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="border-border hover:bg-accent">
                <TableCell>
                  <a
                    href={r.feed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {r.title || r.feed_url}
                  </a>
                  {r.error_count > 0 && (
                    <div className="text-xs text-rose-600 dark:text-rose-300">
                      {r.error_count} error(s): {r.last_error}
                    </div>
                  )}
                </TableCell>
                <TableCell>T{r.default_tier}</TableCell>
                <TableCell>
                  {r.status === "active" ? (
                    <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                      active
                    </Badge>
                  ) : (
                    <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                      paused
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.last_polled_at ? new Date(r.last_polled_at).toLocaleString() : "never"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {r.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() => poll.mutate(r.id)}
                        disabled={poll.isPending}
                      >
                        Poll
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      onClick={() => toggle.mutate(r)}
                      disabled={toggle.isPending}
                    >
                      {r.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
