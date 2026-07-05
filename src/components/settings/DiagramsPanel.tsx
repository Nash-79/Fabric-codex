import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { commissionDiagram, getDiagramCoverage } from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";

function intervalToIso(interval: string): string {
  if (interval === "now") return "";
  const days = interval === "1week" ? 7 : interval === "1month" ? 30 : 0;
  if (!days) return "";
  // Build the schedule offset without Date.now math in the type layer; the server
  // accepts ISO-8601 and treats a future timestamp as "not yet claimable".
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function DiagramsPanel() {
  const coverageFn = useServerFn(getDiagramCoverage);
  const commissionFn = useServerFn(commissionDiagram);
  const queryClient = useQueryClient();
  const cov = useQuery({
    queryKey: ["diagram-coverage"],
    queryFn: () => coverageFn(),
  });
  const [interval, setInterval] = useState<string>("now");

  const commission = useMutation({
    mutationFn: (slug: string) =>
      commissionFn({ data: { targetSlug: slug, scheduledAt: intervalToIso(interval) } }),
    onSuccess: () => {
      toast.success("Diagram commissioned. The diagram-author agent will fulfil the queue.");
      queryClient.invalidateQueries({ queryKey: ["diagram-coverage"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // The server-fn return type is erased across the RPC boundary; assert the shape here.
  type CovRow = {
    slug: string;
    name: string;
    diagram_count: number;
    has_diagram: boolean;
    commission_open: boolean;
  };
  const result = cov.data as { coverage: CovRow[]; pending: unknown[] } | undefined;
  const rows: CovRow[] = result?.coverage ?? [];
  const pending = result?.pending ?? [];

  return (
    <Panel
      title="Diagram coverage & commissioning"
      action={
        <Select value={interval} onValueChange={setInterval}>
          <SelectTrigger className="h-8 w-40 border-border bg-card text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="now">Commission now</SelectItem>
            <SelectItem value="1week">In 1 week</SelectItem>
            <SelectItem value="1month">In 1 month</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {cov.isLoading ? (
        <Empty text="Loading diagram coverage..." />
      ) : rows.length === 0 ? (
        <Empty text="No topics found. Seed content first." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Commissioning enqueues a <code className="text-teal-300">kind=diagram</code> task. The
            local diagram-author agent drains it (
            <code className="text-teal-300">/commission-diagrams</code>), writes an original SVG,
            and posts it as a generated asset — the server never calls an LLM.
          </p>
          <Table className="text-foreground">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Topic</TableHead>
                <TableHead>Diagrams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.slug} className="border-border hover:bg-accent">
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.diagram_count}</TableCell>
                  <TableCell>
                    {r.commission_open ? (
                      <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                        commissioned
                      </Badge>
                    ) : r.has_diagram ? (
                      <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                        covered
                      </Badge>
                    ) : (
                      <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200">gap</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={r.commission_open || commission.isPending}
                      onClick={() => commission.mutate(r.slug)}
                      className="h-7 border-border bg-transparent text-xs text-muted-foreground hover:bg-accent"
                    >
                      Commission
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pending.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {pending.length} diagram commission(s) pending in the queue.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
