import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
type IdeaContentKind = "article" | "lesson" | "both";

type IdeaNotes = {
  angle?: string;
  rationale?: string;
  signal_type?: string;
  target_content_kind?: string;
  capability_level?: string;
  target_length_hint?: string;
  must_include_example?: boolean;
  diagram_guidance?: string;
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

const CONTENT_KIND_LABEL: Record<string, string> = {
  article: "Article",
  lesson: "Lesson",
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
  const [contentKindFilter, setContentKindFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const queryClient = useQueryClient();

  const ideas = useMemo(
    () => (data?.queue ?? []).filter((item: any) => item.kind === "idea"),
    [data],
  );
  const visible = ideas.filter((item: any) => {
    const notes = parseNotes(item.notes);
    if (signalFilter !== "all" && notes.signal_type !== signalFilter) return false;
    if (contentKindFilter !== "all" && notes.target_content_kind !== contentKindFilter) {
      return false;
    }
    return true;
  });

  type GenerateResult = {
    ideas: unknown[];
    usedModelId?: string;
    requestedModelId?: string;
    fallbackUsed?: boolean;
  };

  const onGenerateSuccess = (result: unknown) => {
    const { ideas, usedModelId, fallbackUsed } = result as GenerateResult;
    const count = ideas?.length ?? 0;
    const modelNote = usedModelId
      ? fallbackUsed
        ? ` (fell back to ${usedModelId} after the requested model failed — see Settings → Logs, idea.generation_fallback_used)`
        : ` via ${usedModelId}`
      : "";
    toast.success(
      count
        ? `Generated ${count} idea${count === 1 ? "" : "s"}${modelNote}.`
        : "No new ideas — either not enough signal right now, or every candidate failed the " +
            "grounding check (see Settings → Logs for idea.generation_filtered).",
    );
    onDone();
  };
  const onGenerateError = (err: unknown) =>
    toast.error((err as Error).message, {
      description: "See Settings → Logs (idea.generation_failed) for the per-model attempt chain.",
      duration: 10000,
    });

  // Ideas already dismissed or already kept (queued/claimed) are fed back as PRIOR ROUND context
  // so a follow-up generation doesn't repeat a rejected idea and can build on one the admin kept.
  const priorIdeasContext = useMemo(
    () =>
      ideas
        .filter(
          (item: any) =>
            item.status === "dismissed" || item.status === "queued" || item.status === "claimed",
        )
        .slice(0, 30)
        .map((item: any) => {
          const notes = parseNotes(item.notes);
          return {
            title: item.title,
            angle: notes.angle ?? "",
            signal_type: notes.signal_type ?? "",
            status: (item.status === "dismissed" ? "dismissed" : "kept") as "dismissed" | "kept",
          };
        }),
    [ideas],
  );

  const generateAuto = useMutation({
    mutationFn: () => generateFn({ data: { priorIdeas: priorIdeasContext } }),
    onSuccess: onGenerateSuccess,
    onError: onGenerateError,
  });

  const generatePrompted = useMutation({
    mutationFn: (input: { userPrompt: string; contentKind?: IdeaContentKind }) =>
      generateFn({ data: { ...input, priorIdeas: priorIdeasContext } }),
    onSuccess: (result) => {
      onGenerateSuccess(result);
      setPromptOpen(false);
      setPromptText("");
    },
    onError: onGenerateError,
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

  const anyGenerating = generateAuto.isPending || generatePrompted.isPending;

  return (
    <Panel
      title="Article ideas"
      action={
        <div className="flex flex-wrap items-center gap-2">
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
          <Select value={contentKindFilter} onValueChange={setContentKindFilter}>
            <SelectTrigger className="h-8 w-32 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="article">Articles</SelectItem>
              <SelectItem value="lesson">Lessons</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-border bg-card text-foreground"
            onClick={() => setPromptOpen(true)}
            disabled={anyGenerating}
          >
            Generate from prompt
          </Button>
          <Button size="sm" onClick={() => generateAuto.mutate()} disabled={anyGenerating}>
            {generateAuto.isPending ? "Generating…" : "Auto-generate"}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Fuses the Fabric roadmap, knowledge-base coverage gaps, the editorial backlog, and stale
        articles into candidate article or lesson ideas via the Lovable AI Gateway (bundled credits,
        not the metered Anthropic API). Every idea cites a concrete signal — a roadmap item, a
        capability gap, a queue/feedback entry, or a stale article — and carries a length hint and
        (for articles) diagram guidance calibrated to what blog-author/learning-author actually
        produce. Approving an idea just marks it <code className="text-teal-300">claimed</code>; run{" "}
        <code className="text-teal-300">/publish-topic &lt;slug&gt; --idea &lt;id&gt;</code>,{" "}
        <code className="text-teal-300">/blog &lt;slug&gt; --idea &lt;id&gt;</code>, or{" "}
        <code className="text-teal-300">
          /lesson &lt;capability&gt; &lt;level&gt; --idea &lt;id&gt;
        </code>{" "}
        locally to author it with the idea's brief folded in automatically.
      </p>

      {loading ? (
        <Empty text="Loading ideas..." />
      ) : visible.length === 0 ? (
        <Empty text="No article ideas yet. Click Auto-generate or Generate from prompt." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Idea</TableHead>
              <TableHead>Kind</TableHead>
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
                        {CONTENT_KIND_LABEL[notes.target_content_kind ?? ""] ?? "—"}
                      </Badge>
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
                      <TableCell colSpan={6} className="bg-card/50 text-xs">
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
                          {notes.target_length_hint && (
                            <div>
                              <span className="font-semibold text-foreground">Length: </span>
                              <span className="text-muted-foreground">
                                {notes.target_length_hint}
                                {notes.must_include_example ? " · worked example required" : ""}
                              </span>
                            </div>
                          )}
                          {notes.target_content_kind === "lesson" && notes.capability_level && (
                            <div>
                              <span className="font-semibold text-foreground">Level: </span>
                              <span className="text-muted-foreground">
                                {notes.capability_level}
                              </span>
                            </div>
                          )}
                          {notes.target_content_kind === "article" &&
                            (notes.diagram_guidance || !!notes.suggested_diagrams?.length) && (
                              <div>
                                <span className="font-semibold text-foreground">
                                  Diagram guidance:{" "}
                                </span>
                                <span className="text-muted-foreground">
                                  {notes.diagram_guidance || notes.suggested_diagrams?.join("; ")}
                                </span>
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

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>Generate ideas from a prompt</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Describe a topic or direction. Ideas are still cross-checked against real
              roadmap/coverage/backlog signals where one exists; a direction with no supporting
              signal still produces an idea, honestly marked low priority and labeled admin-directed
              rather than signal-driven.
              {priorIdeasContext.length > 0 &&
                ` Dismissed and kept ideas from earlier rounds (${priorIdeasContext.length} here) are passed along too, so this generation won't repeat what you already rejected and can sharpen what you kept.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="e.g. articles that help migrate from Import mode to Direct Lake"
            rows={4}
            className="border-border bg-card text-foreground"
          />
          <Button
            onClick={() => generatePrompted.mutate({ userPrompt: promptText.trim() })}
            disabled={!promptText.trim() || generatePrompted.isPending}
          >
            {generatePrompted.isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
