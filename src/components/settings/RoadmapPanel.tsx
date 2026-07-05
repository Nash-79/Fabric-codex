import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRoadmapItems } from "@/lib/atlas.functions";
import { getRoadmapSyncStatus, pollFabricRoadmap } from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";

type RoadmapSyncStatus = {
  status: { last_polled_at: string | null; error_count: number; last_error: string } | null;
  itemCount: number;
};

export function RoadmapPanel() {
  const statusFn = useServerFn(getRoadmapSyncStatus);
  const pollFn = useServerFn(pollFabricRoadmap);
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["roadmap-sync-status"],
    queryFn: () => statusFn(),
  });
  const items = useQuery({
    queryKey: ["roadmap-items-admin"],
    queryFn: () => listRoadmapItems(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["roadmap-sync-status"] });
    queryClient.invalidateQueries({ queryKey: ["roadmap-items-admin"] });
  };

  const poll = useMutation({
    mutationFn: () => pollFn(),
    onSuccess: (res) => {
      const r = res as {
        ok: boolean;
        found: number;
        created: number;
        updated: number;
        error: string | null;
      };
      if (r.error) {
        toast.warning(`Poll failed: ${r.error}`);
      } else {
        toast.success(`Synced ${r.found} item(s): ${r.created} new, ${r.updated} updated.`);
      }
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const data = status.data as RoadmapSyncStatus | undefined;
  const rows = (items.data ?? []) as Array<{
    id: string;
    title: string;
    link: string;
    status: string;
    release_type: string;
    target_release: string;
    pub_date: string | null;
  }>;

  return (
    <Panel
      title="Fabric roadmap"
      action={
        <Button size="sm" onClick={() => poll.mutate()} disabled={poll.isPending}>
          {poll.isPending ? "Polling…" : "Poll now"}
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Synced verbatim from the Microsoft Fabric public roadmap feed (
        <code className="text-teal-300">fabric-gps.com/rss</code>) — items are mirrored directly,
        never paraphrased or invented, matching the &ldquo;no source, no claim&rdquo; rule.
        <span className="text-foreground"> Poll now</span> fetches the 25 most-recently-modified
        releases and upserts them by guid.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-muted-foreground">Items synced</div>
          <div className="text-lg font-semibold">{data?.itemCount ?? "—"}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-muted-foreground">Last polled</div>
          <div className="text-sm font-semibold">
            {data?.status?.last_polled_at
              ? new Date(data.status.last_polled_at).toLocaleString()
              : "never"}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-muted-foreground">Errors</div>
          <div className="text-sm font-semibold">
            {data?.status?.error_count ? (
              <span className="text-rose-300">
                {data.status.error_count}: {data.status.last_error}
              </span>
            ) : (
              "0"
            )}
          </div>
        </div>
      </div>

      {items.isLoading ? (
        <Empty text="Loading roadmap items..." />
      ) : rows.length === 0 ? (
        <Empty text="No roadmap items synced yet. Click Poll now." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Release type</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 50).map((r) => (
              <TableRow key={r.id} className="border-border hover:bg-accent">
                <TableCell>
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {r.title}
                  </a>
                </TableCell>
                <TableCell>
                  <Badge className="border-border bg-accent text-foreground">
                    {r.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.release_type}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.target_release || "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.pub_date ? new Date(r.pub_date).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
