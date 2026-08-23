import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { listContentFeedback, setFeedbackStatus, triageFeedback } from "@/lib/settings.functions";
import { Empty, Panel, statusBadge } from "@/components/settings/shared";

type FeedbackRow = {
  id: string;
  content_item_id: string;
  category: string;
  body: string;
  section_id: string | null;
  section_title: string | null;
  status: "new" | "triaged" | "actioned" | "dismissed";
  ai_analysis: Record<string, unknown> | null;
  triaged_at: string | null;
  created_at: string;
  content_items: { kind: string; slug: string; title: string } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  factual_error: "Factual error",
  outdated: "Outdated",
  unclear: "Unclear",
  broken_link: "Broken link/diagram",
  missing_citation: "Missing citation",
  other: "Other",
};

function ApplyTriageResults({ onDone }: { onDone: () => void }) {
  const triageFn = useServerFn(triageFeedback);
  const [json, setJson] = useState("");

  const apply = useMutation({
    mutationFn: async () => {
      let payload: Array<{
        id: string;
        status: "triaged" | "actioned" | "dismissed";
        ai_analysis: Record<string, unknown>;
      }>;
      try {
        payload = JSON.parse(json);
      } catch {
        throw new Error(
          "That isn't valid JSON — paste the full content/feedback-triage/*.json file.",
        );
      }
      if (!Array.isArray(payload)) throw new Error("Expected a JSON array of triage verdicts.");
      let applied = 0;
      for (const row of payload) {
        await triageFn({ data: { id: row.id, status: row.status, aiAnalysis: row.ai_analysis } });
        applied += 1;
      }
      return applied;
    },
    onSuccess: (applied) => {
      toast.success(`Applied ${applied} triage verdict(s).`);
      setJson("");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Panel title="Apply triage results">
      <p className="mb-3 text-xs text-muted-foreground">
        After running <code className="text-teal-600 dark:text-teal-300">/triage-feedback</code>,
        paste the contents of the written{" "}
        <code className="text-teal-600 dark:text-teal-300">content/feedback-triage/*.json</code>{" "}
        file here to post each verdict's{" "}
        <code className="text-teal-600 dark:text-teal-300">ai_analysis</code> and{" "}
        <code className="text-teal-600 dark:text-teal-300">status</code> back.
      </p>
      <Textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='[{"id":"...","status":"triaged","ai_analysis":{...}}]'
        rows={6}
        className="border-border bg-card font-mono text-xs text-foreground"
      />
      <Button
        size="sm"
        className="mt-3"
        onClick={() => apply.mutate()}
        disabled={apply.isPending || !json.trim()}
      >
        {apply.isPending ? "Applying…" : "Apply"}
      </Button>
    </Panel>
  );
}

function FeedbackRow({
  row,
  clusterCount,
  onDone,
}: {
  row: FeedbackRow;
  clusterCount: number;
  onDone: () => void;
}) {
  const statusFn = useServerFn(setFeedbackStatus);
  const setStatus = useMutation({
    mutationFn: (status: "actioned" | "dismissed") => statusFn({ data: { id: row.id, status } }),
    onSuccess: () => {
      toast.success("Updated.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const analysis = row.ai_analysis as {
    summary?: string;
    classification?: string;
    suggested_action?: string;
    reasoning?: string;
  } | null;

  return (
    <TableRow>
      <TableCell className="max-w-[220px]">
        {row.content_items ? (
          <a
            href={
              row.section_id
                ? `/blogs/${row.content_items.kind}/${row.content_items.slug}#${row.section_id}`
                : `/blogs/${row.content_items.kind}/${row.content_items.slug}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 dark:text-teal-300 hover:underline"
          >
            {row.content_items.title}
          </a>
        ) : (
          <span className="text-muted-foreground">deleted item</span>
        )}
        {row.section_title && (
          <div
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={row.section_title}
          >
            § {row.section_title}
            {clusterCount > 1 && (
              <span className="ml-1 rounded-sm bg-amber-500/10 px-1 text-amber-200">
                ×{clusterCount}
              </span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge className="rounded-sm border border-border bg-card text-[11px] text-muted-foreground">
          {CATEGORY_LABEL[row.category] ?? row.category}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[320px] whitespace-pre-wrap text-xs text-muted-foreground">
        {row.body}
      </TableCell>
      <TableCell>{statusBadge(row.status)}</TableCell>
      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
        {analysis ? (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{analysis.summary}</div>
            <div>
              {analysis.classification} → {analysis.suggested_action}
            </div>
          </div>
        ) : (
          <span>Not triaged yet — run /triage-feedback</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {row.status === "triaged" && (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-border bg-card text-foreground"
              onClick={() => setStatus.mutate("actioned")}
              disabled={setStatus.isPending}
            >
              Mark actioned
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-border bg-card text-foreground"
              onClick={() => setStatus.mutate("dismissed")}
              disabled={setStatus.isPending}
            >
              Dismiss
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function FeedbackPanel() {
  const listFn = useServerFn(listContentFeedback);
  const queryClient = useQueryClient();
  const feedback = useQuery({
    queryKey: ["content-feedback"],
    queryFn: () => listFn({ data: {} }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["content-feedback"] });
  const rows = (feedback.data ?? []) as unknown as FeedbackRow[];
  const newCount = rows.filter((r) => r.status === "new").length;

  // Cluster counts by (article, section) so triage can see "3 reports on the same section" at a
  // glance instead of independently re-discovering the pattern across scattered rows.
  const clusterKey = (r: FeedbackRow) => `${r.content_item_id}::${r.section_id ?? ""}`;
  const clusterCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = clusterKey(r);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Panel
        title="Reader feedback"
        action={
          newCount > 0 ? (
            <Badge className="rounded-sm border border-amber-400/30 bg-amber-500/10 text-[11px] text-amber-200">
              {newCount} new
            </Badge>
          ) : undefined
        }
      >
        {feedback.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty text="No feedback yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI triage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <FeedbackRow
                  key={row.id}
                  row={row}
                  clusterCount={clusterCounts[clusterKey(row)] ?? 1}
                  onDone={refresh}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <ApplyTriageResults onDone={refresh} />
    </div>
  );
}
