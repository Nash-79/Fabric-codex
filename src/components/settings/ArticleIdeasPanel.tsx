import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateArticleIdeas, setArticleIdeaStatus } from "@/lib/article-ideas.functions";
import { Empty, Panel, statusBadge } from "@/components/settings/shared";

type QueueAction = "claim" | "complete" | "fail" | "requeue" | "dismiss";

type IdeaNotes = {
  angle?: string;
  rationale?: string;
  signal_type?: string;
  supporting_capability_ids?: string[];
  supporting_roadmap_ids?: string[];
  suggested_diagrams?: string[];
  priority?: string;
};

function parseNotes(notes: unknown): IdeaNotes {
  if (typeof notes !== "string" || !notes.trim()) return {};
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}

const SIGNAL_LABEL: Record<string, string> = {
  roadmap: "Roadmap",
  coverage: "Coverage gap",
  backlog: "Backlog",
  staleness: "Stale article",
};

const PRIORITY_CLASS: Record<string, string> = {
  high: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  low: "border-border bg-card text-muted-foreground",
};

export function ArticleIdeasPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const generateFn = useServerFn(generateArticleIdeas);
  const statusFn = useServerFn(setArticleIdeaStatus);
  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const ideas = useMemo(
    () => (data?.queue ?? []).filter((item: any) => item.kind === "idea"),
    [data],
  );
  const visible =
    signalFilter === "all"
      ? ideas
      : ideas.filter((item: any) => parseNotes(item.notes).signal_type === signalFilter);

  const generate = useMutation({
    mutationFn: () => generateFn({ data: {} }),
    onSuccess: (result) => {
      const count = (result as { ideas: unknown[] }).ideas?.length ?? 0;
      toast.success(
        count
          ? `Generated ${count} idea${count === 1 ? "" : "s"}.`
          : "No new ideas — not enough signal right now (roadmap/coverage/backlog/staleness all quiet).",
      );
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const mutateStatus = useMutation({
    mutationFn: (input: { itemId: string; action: QueueAction }) => statusFn({ data: input }),
    onSuccess: () => {
      toast.success("Idea updated.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel
      title="Article ideas"
      action={
        <div className="flex items-center gap-2">
          <Select value={signalFilter} onValueChange={setSignalFilter}>
            <SelectTrigger className="h-8 w-40 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All signals</SelectItem>
              <SelectItem value="roadmap">Roadmap</SelectItem>
              <SelectItem value="coverage">Coverage gap</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="staleness">Stale article</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate ideas"}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Fuses the Fabric roadmap, knowledge-base coverage gaps, the editorial backlog, and stale
        articles into candidate ideas via the Lovable AI Gateway (bundled credits, not the metered
        Anthropic API). Every idea cites a concrete signal — a roadmap item, a capability gap, a
        queue/feedback entry, or a stale article. Approving an idea just marks it{" "}
        <code className="text-teal-300">claimed</code>; run{" "}
        <code className="text-teal-300">/publish-topic &lt;slug&gt;</code> or{" "}
        <code className="text-teal-300">/blog &lt;slug&gt;</code> locally to actually author it,
        using the idea&rsquo;s rationale as drafting context.
      </p>

      {loading ? (
        <Empty text="Loading ideas..." />
      ) : visible.length === 0 ? (
        <Empty text="No article ideas yet. Click Generate ideas." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Idea</TableHead>
              <TableHead>Signal</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item: any) => {
              const notes = parseNotes(item.notes);
              const isOpen = expanded.has(item.id);
              return (
                <>
                  <TableRow key={item.id} className="border-border hover:bg-accent">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="text-left text-teal-200 hover:underline"
                      >
                        {item.title}
                      </button>
                      <div className="text-xs text-muted-foreground">{item.target_slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className="border-border bg-accent text-foreground">
                        {SIGNAL_LABEL[notes.signal_type ?? ""] ?? notes.signal_type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`rounded-sm border text-[11px] ${PRIORITY_CLASS[notes.priority ?? ""] ?? PRIORITY_CLASS.low}`}
                      >
                        {notes.priority ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border bg-card text-foreground"
                          disabled={mutateStatus.isPending || item.status !== "queued"}
                          onClick={() => mutateStatus.mutate({ itemId: item.id, action: "claim" })}
                        >
                          approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border bg-card text-foreground"
                          disabled={
                            mutateStatus.isPending || !["queued", "claimed"].includes(item.status)
                          }
                          onClick={() =>
                            mutateStatus.mutate({ itemId: item.id, action: "complete" })
                          }
                        >
                          mark written
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border bg-card text-foreground"
                          disabled={
                            mutateStatus.isPending || !["queued", "failed"].includes(item.status)
                          }
                          onClick={() =>
                            mutateStatus.mutate({ itemId: item.id, action: "dismiss" })
                          }
                        >
                          dismiss
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${item.id}-detail`} className="border-border">
                      <TableCell colSpan={5} className="bg-card/50 text-xs">
                        <div className="space-y-1 py-2">
                          {notes.angle && (
                            <div>
                              <span className="font-semibold text-foreground">Angle: </span>
                              <span className="text-muted-foreground">{notes.angle}</span>
                            </div>
                          )}
                          {notes.rationale && (
                            <div>
                              <span className="font-semibold text-foreground">Rationale: </span>
                              <span className="text-muted-foreground">{notes.rationale}</span>
                            </div>
                          )}
                          {!!notes.supporting_capability_ids?.length && (
                            <div>
                              <span className="font-semibold text-foreground">Capabilities: </span>
                              <span className="text-muted-foreground">
                                {notes.supporting_capability_ids.join(", ")}
                              </span>
                            </div>
                          )}
                          {!!notes.supporting_roadmap_ids?.length && (
                            <div>
                              <span className="font-semibold text-foreground">Roadmap refs: </span>
                              <span className="text-muted-foreground">
                                {notes.supporting_roadmap_ids.join(", ")}
                              </span>
                            </div>
                          )}
                          {!!notes.suggested_diagrams?.length && (
                            <div>
                              <span className="font-semibold text-foreground">
                                Suggested diagrams:{" "}
                              </span>
                              <span className="text-muted-foreground">
                                {notes.suggested_diagrams.join("; ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
