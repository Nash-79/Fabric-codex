import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  commissionDiagram,
  deleteDiagram,
  getDiagramCoverage,
  updateDiagram,
  uploadDiagramImage,
} from "@/lib/settings.functions";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { Empty, Panel } from "@/components/settings/shared";

function intervalToIso(interval: string): string {
  if (interval === "now") return "";
  const days = interval === "1week" ? 7 : interval === "1month" ? 30 : 0;
  if (!days) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

type CovRow = {
  slug: string;
  name: string;
  diagram_count: number;
  has_diagram: boolean;
  commission_open: boolean;
};

type DiagramRow = {
  slug: string;
  path: string;
  caption: string;
  kind: string;
  topic_slug: string | null;
  capability_id?: string | null;
};

export function DiagramsPanel() {
  const coverageFn = useServerFn(getDiagramCoverage);
  const commissionFn = useServerFn(commissionDiagram);
  const updateFn = useServerFn(updateDiagram);
  const uploadFn = useServerFn(uploadDiagramImage);
  const deleteFn = useServerFn(deleteDiagram);
  const queryClient = useQueryClient();
  const cov = useQuery({ queryKey: ["diagram-coverage"], queryFn: () => coverageFn() });
  const [interval, setInterval] = useState<string>("now");
  const [edit, setEdit] = useState<DiagramRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<DiagramRow | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["diagram-coverage"] });

  const commission = useMutation({
    mutationFn: (slug: string) =>
      commissionFn({ data: { targetSlug: slug, scheduledAt: intervalToIso(interval) } }),
    onSuccess: () => {
      toast.success("Diagram commissioned. The diagram-author agent will fulfil the queue.");
      refresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const saveMeta = useMutation({
    mutationFn: (row: DiagramRow) =>
      updateFn({
        data: {
          slug: row.slug,
          caption: row.caption ?? "",
          kind: row.kind ?? "architecture",
          topic_slug: row.topic_slug ?? null,
          capability_id: row.capability_id ?? null,
          path: row.path,
        },
      }),
    onSuccess: () => {
      toast.success("Diagram metadata updated.");
      setEdit(null);
      refresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const remove = useMutation({
    mutationFn: (slug: string) => deleteFn({ data: { slug } }),
    onSuccess: () => {
      toast.success("Diagram deleted. Embedded articles will fail validation until restored.");
      refresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const result = cov.data as
    { coverage: CovRow[]; pending: unknown[]; diagrams: DiagramRow[] } | undefined;
  const rows = result?.coverage ?? [];
  const diagrams = useMemo(() => result?.diagrams ?? [], [result?.diagrams]);
  const pending = result?.pending ?? [];
  const diagramsByTopic = useMemo(() => {
    const map = new Map<string, DiagramRow[]>();
    for (const d of diagrams) {
      const key = d.topic_slug ?? "";
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  }, [diagrams]);

  return (
    <Panel
      title="Diagram coverage & management"
      action={
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload new
          </Button>
        </div>
      }
    >
      {cov.isLoading ? (
        <Empty text="Loading diagram coverage..." />
      ) : rows.length === 0 ? (
        <Empty text="No topics found. Seed content first." />
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Replacing a diagram stores an SVG in Supabase Storage and keeps the same slug, so live
            articles update without redeploy. Backport storage overrides to{" "}
            <code className="text-teal-300">content/diagrams/</code> when the SVG should become
            source-controlled truth.
          </p>
          {rows.map((topic) => {
            const topicDiagrams = diagramsByTopic.get(topic.slug) ?? [];
            return (
              <section key={topic.slug} className="rounded-md border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{topic.name}</div>
                    <div className="text-xs text-muted-foreground">{topic.slug}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {topic.commission_open ? (
                      <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                        commissioned
                      </Badge>
                    ) : topic.has_diagram ? (
                      <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                        {topic.diagram_count} diagram(s)
                      </Badge>
                    ) : (
                      <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200">gap</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={topic.commission_open || commission.isPending}
                      onClick={() => commission.mutate(topic.slug)}
                      className="h-8 border-border bg-card text-foreground"
                    >
                      Commission
                    </Button>
                  </div>
                </div>
                {topicDiagrams.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    No diagrams registered.
                  </div>
                ) : (
                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    {topicDiagrams.map((d) => (
                      <div key={d.slug} className="rounded-md border border-border bg-card p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {d.slug}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{d.kind}</div>
                          </div>
                          {/^https?:\/\//i.test(d.path) && (
                            <Badge className="border-teal-400/30 bg-teal-500/10 text-teal-200">
                              storage override
                            </Badge>
                          )}
                        </div>
                        <div className="h-36 overflow-hidden rounded border border-border bg-background">
                          <DiagramLightbox
                            src={d.path}
                            alt={d.caption || d.slug}
                            caption={d.caption}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEdit(d)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setReplaceTarget(d)}>
                            Replace
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-400/30 bg-rose-500/10 text-rose-200"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete diagram ${d.slug}? Embedded content will fail validation.`,
                                )
                              ) {
                                remove.mutate(d.slug);
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {pending.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {pending.length} diagram commission(s) pending in the queue.
            </p>
          )}
        </div>
      )}
      <MetadataDialog edit={edit} setEdit={setEdit} save={saveMeta} />
      <UploadDialog
        open={uploadOpen || !!replaceTarget}
        onOpenChange={(open) => {
          if (!open) {
            setUploadOpen(false);
            setReplaceTarget(null);
          }
        }}
        topics={rows}
        target={replaceTarget}
        uploadFn={uploadFn}
        onDone={() => {
          setUploadOpen(false);
          setReplaceTarget(null);
          refresh();
        }}
      />
    </Panel>
  );
}

function MetadataDialog({
  edit,
  setEdit,
  save,
}: {
  edit: DiagramRow | null;
  setEdit: (row: DiagramRow | null) => void;
  save: ReturnType<typeof useMutation<any, Error, DiagramRow>>;
}) {
  const [draft, setDraft] = useState<DiagramRow | null>(null);
  const active = draft ?? edit;
  if (!active) return null;
  const set = (key: keyof DiagramRow, value: string | null) =>
    setDraft({ ...active, [key]: value });
  return (
    <Dialog
      open={!!edit}
      onOpenChange={(open) => {
        if (!open) {
          setEdit(null);
          setDraft(null);
        }
      }}
    >
      <DialogContent className="border-border bg-popover text-foreground">
        <DialogHeader>
          <DialogTitle>Edit diagram</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Metadata changes update the registry row. SVG replacement uses Replace.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Slug" value={active.slug} disabled />
          <Field label="Caption" value={active.caption ?? ""} onChange={(v) => set("caption", v)} />
          <Field
            label="Kind"
            value={active.kind ?? "architecture"}
            onChange={(v) => set("kind", v)}
          />
          <Field
            label="Topic slug"
            value={active.topic_slug ?? ""}
            onChange={(v) => set("topic_slug", v || null)}
          />
          <Field
            label="Capability id"
            value={active.capability_id ?? ""}
            onChange={(v) => set("capability_id", v || null)}
          />
          <Field label="Path" value={active.path ?? ""} onChange={(v) => set("path", v)} />
        </div>
        <Button onClick={() => save.mutate(active)} disabled={save.isPending}>
          Save metadata
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  topics,
  target,
  uploadFn,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: CovRow[];
  target: DiagramRow | null;
  uploadFn: ReturnType<typeof useServerFn<typeof uploadDiagramImage>>;
  onDone: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [caption, setCaption] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [kind, setKind] = useState("architecture");
  const [svgText, setSvgText] = useState("");
  const upload = useMutation({
    mutationFn: () =>
      uploadFn({
        data: {
          slug: target?.slug ?? slug,
          svgText,
          caption: caption || target?.caption || "",
          kind: kind || target?.kind || "architecture",
          topicSlug: topicSlug || target?.topic_slug || null,
          capabilityId: capabilityId || target?.capability_id || null,
        },
      }),
    onSuccess: () => {
      toast.success(target ? "Diagram replaced." : "Diagram uploaded.");
      setSlug("");
      setCaption("");
      setTopicSlug("");
      setCapabilityId("");
      setKind("architecture");
      setSvgText("");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target ? `Replace ${target.slug}` : "Upload diagram"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Upload an original SVG. Scripts, event handlers, and javascript URLs are rejected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!target && <Field label="Slug" value={slug} onChange={setSlug} />}
          <Field label="Caption" value={caption} onChange={setCaption} />
          <Field label="Kind" value={kind} onChange={setKind} />
          <Field label="Capability id" value={capabilityId} onChange={setCapabilityId} />
          <div>
            <Label className="text-muted-foreground">Topic</Label>
            <Select value={topicSlug || target?.topic_slug || ""} onValueChange={setTopicSlug}>
              <SelectTrigger className="mt-1 border-border bg-card text-foreground">
                <SelectValue placeholder="Choose topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.slug} value={topic.slug}>
                    {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="file"
            accept=".svg,image/svg+xml"
            className="border-border bg-card text-foreground"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setSvgText(await file.text());
            }}
          />
          <Textarea
            value={svgText}
            onChange={(e) => setSvgText(e.target.value)}
            rows={8}
            placeholder="<svg ..."
            className="border-border bg-card font-mono text-xs text-foreground"
          />
        </div>
        <Button
          onClick={() => upload.mutate()}
          disabled={upload.isPending || !svgText.trim() || (!target && !slug.trim())}
        >
          {upload.isPending ? "Uploading…" : target ? "Replace diagram" : "Upload diagram"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1 border-border bg-card text-foreground"
      />
    </div>
  );
}
