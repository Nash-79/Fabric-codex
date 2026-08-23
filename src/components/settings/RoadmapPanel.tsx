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
import {
  getRoadmapSyncStatus,
  pollFabricRoadmap,
  updateRoadmapItemCapability,
} from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RoadmapSyncStatus = {
  status: { last_polled_at: string | null; error_count: number; last_error: string } | null;
  itemCount: number;
};

export function RoadmapPanel() {
  const statusFn = useServerFn(getRoadmapSyncStatus);
  const pollFn = useServerFn(pollFabricRoadmap);
  const updateCapabilityFn = useServerFn(updateRoadmapItemCapability);
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
        blogsQueued: number;
        blogsAutoClaimed: number;
        pages: number;
        error: string | null;
      };
      if (r.error) {
        toast.warning(`Poll failed: ${r.error}`);
      } else {
        toast.success(
          `Synced ${r.found} item(s) across ${r.pages} page(s); queued ${r.blogsQueued} blog(s), ${r.blogsAutoClaimed} auto-claimed.`,
        );
      }
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const updateCapability = useMutation({
    mutationFn: (input: { id: string; capabilityId?: string | null }) =>
      updateCapabilityFn({ data: input }),
    onSuccess: () => {
      toast.success("Roadmap capability updated.");
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
    capability_id: string | null;
  }>;
  const capabilities = [
    "fabric-platform",
    "capacity",
    "purview",
    "onelake",
    "lakehouse",
    "mirroring",
    "spark",
    "data-factory",
    "dataflow-gen2",
    "warehouse",
    "polaris",
    "sql-database",
    "direct-lake",
    "semantic-model",
    "power-bi",
    "rti",
    "eventhouse-kql",
    "fabric-data-agent",
    "fabric-iq",
    "graphql-api",
  ];

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
        Synced from the Fabric GPS community mirror of Microsoft&rsquo;s Fabric roadmap (
        <code className="text-teal-600 dark:text-teal-300">fabric-gps.com/api/releases</code>). The
        paginated API payload is preserved without embellishment. Canonical Microsoft blog links are
        added to the source queue and auto-claimed; extracted claims still require normal
        verification.
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
              <span className="text-rose-600 dark:text-rose-300">
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
              <TableHead>Capability</TableHead>
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
                <TableCell>
                  <Select
                    value={r.capability_id ?? "none"}
                    onValueChange={(value) =>
                      updateCapability.mutate({
                        id: r.id,
                        capabilityId: value === "none" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-44 border-border bg-card text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unmapped</SelectItem>
                      {capabilities.map((capability) => (
                        <SelectItem key={capability} value={capability}>
                          {capability}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
