import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createHelpDoc,
  createTopic,
  deactivateTopic,
  deleteHelpDoc,
  submitSourceReview,
  updateCapability,
  updateDiagram,
  updateHelpDoc,
  updateSourceMetadata,
  updateTopicMetadata,
  validateContent,
} from "@/lib/settings.functions";
import { Area, Empty, Field, Panel, splitTags } from "@/components/settings/shared";

export function ContentPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const reviewFn = useServerFn(submitSourceReview);
  const validateFn = useServerFn(validateContent);
  const deactivateTopicFn = useServerFn(deactivateTopic);
  const deleteHelpFn = useServerFn(deleteHelpDoc);
  const [edit, setEdit] = useState<{
    kind: "source" | "topic" | "capability" | "help" | "diagram";
    item: any;
  } | null>(null);
  const [createKind, setCreateKind] = useState<"topic" | "help" | null>(null);
  const review = useMutation({
    mutationFn: (sourceId: string) => reviewFn({ data: { sourceId } }),
    onSuccess: () => {
      toast.success("Source queued for drift review.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const validate = useMutation({
    mutationFn: (id: string) => validateFn({ data: { kind: "design", id } }),
    onSuccess: () => {
      toast.success("Design validation queued.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const rowAction = useMutation({
    mutationFn: (task: Promise<unknown>) => task,
    onSuccess: () => {
      toast.success("Content updated.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const counts = [
    ["Sources", data?.sources?.length ?? 0],
    ["Topics", data?.topics?.length ?? 0],
    ["Capabilities", data?.capabilities?.length ?? 0],
    ["Help docs", data?.helpDocs?.length ?? 0],
    ["Diagrams", data?.diagrams?.length ?? 0],
    ["Designs", data?.designs?.length ?? 0],
  ];
  return (
    <>
      <Panel title="Content">
        {loading ? (
          <Empty text="Loading content..." />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {counts.map(([label, count]) => (
                <div key={label} className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-semibold">{count}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setCreateKind("topic")}>
                New topic
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreateKind("help")}>
                New help doc
              </Button>
            </div>
            <CompactList
              title="Sources"
              rows={data?.sources ?? []}
              label={(s) => s.title}
              meta={(s) => `T${s.tier} · ${s.slug}`}
              onEdit={(item) => setEdit({ kind: "source", item })}
              extraAction={(item) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border bg-card text-foreground"
                  disabled={review.isPending}
                  onClick={() => review.mutate(item.id)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Review
                </Button>
              )}
            />
            <CompactList
              title="Topics"
              rows={data?.topics ?? []}
              label={(t) => t.name}
              meta={(t) => t.slug}
              onEdit={(item) => setEdit({ kind: "topic", item })}
              extraAction={(item) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border bg-card text-foreground"
                  disabled={rowAction.isPending || item.active === false}
                  onClick={() => rowAction.mutate(deactivateTopicFn({ data: { slug: item.slug } }))}
                >
                  Deactivate
                </Button>
              )}
            />
            <CompactList
              title="Capabilities"
              rows={data?.capabilities ?? []}
              label={(c) => c.name}
              meta={(c) => `${c.id} · ${c.maturity ?? "ga"}`}
              onEdit={(item) => setEdit({ kind: "capability", item })}
            />
            <CompactList
              title="Help docs"
              rows={data?.helpDocs ?? []}
              label={(h) => h.title}
              meta={(h) => h.slug}
              onEdit={(item) => setEdit({ kind: "help", item })}
              extraAction={(item) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-rose-400/30 bg-rose-500/10 text-rose-200"
                  disabled={rowAction.isPending}
                  onClick={() => {
                    if (confirm(`Delete help doc ${item.slug}?`)) {
                      rowAction.mutate(deleteHelpFn({ data: { slug: item.slug } }));
                    }
                  }}
                >
                  Delete
                </Button>
              )}
            />
            <CompactList
              title="Diagrams"
              rows={data?.diagrams ?? []}
              label={(d) => d.caption || d.slug}
              meta={(d) => `${d.kind} · ${d.path}`}
              onEdit={(item) => setEdit({ kind: "diagram", item })}
            />
            <CompactList
              title="Designs"
              rows={data?.designs ?? []}
              label={(d) => d.title}
              meta={(d) => `${d.status} · ${d.slug}`}
              onEdit={() =>
                toast.info("Edit design bodies from Settings → Articles (filter: Designs).")
              }
              extraAction={(item) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border bg-card text-foreground"
                  disabled={validate.isPending}
                  onClick={() => validate.mutate(item.id)}
                >
                  Validate
                </Button>
              )}
            />
          </div>
        )}
      </Panel>
      <ContentEditor edit={edit} setEdit={setEdit} onDone={onDone} />
      <CreateContentDialog
        kind={createKind}
        setKind={setCreateKind}
        capabilities={data?.capabilities ?? []}
        onDone={onDone}
      />
    </>
  );
}

function CompactList({
  title,
  rows,
  label,
  meta,
  onEdit,
  extraAction,
}: {
  title: string;
  rows: any[];
  label: (r: any) => string;
  meta: (r: any) => string;
  onEdit: (r: any) => void;
  extraAction?: (r: any) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filtered = rows.filter((row) => {
    const term = query.trim().toLowerCase();
    return !term || `${label(row)} ${meta(row)}`.toLowerCase().includes(term);
  });
  const visible = showAll ? filtered : filtered.slice(0, 8);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter"
          className="h-8 w-44 border-border bg-card text-foreground"
        />
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {visible.map((row) => (
          <div
            key={row.id ?? row.slug}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate text-foreground">{label(row)}</div>
              <div className="truncate text-xs text-muted-foreground">{meta(row)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              {extraAction?.(row)}
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border bg-card text-foreground"
                onClick={() => onEdit(row)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length > 8 && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "Show fewer" : `Show all (${filtered.length})`}
        </Button>
      )}
    </div>
  );
}

function ContentEditor({
  edit,
  setEdit,
  onDone,
}: {
  edit: any;
  setEdit: (v: any) => void;
  onDone: () => void;
}) {
  const sourceFn = useServerFn(updateSourceMetadata);
  const topicFn = useServerFn(updateTopicMetadata);
  const capFn = useServerFn(updateCapability);
  const helpFn = useServerFn(updateHelpDoc);
  const diagramFn = useServerFn(updateDiagram);
  const [draft, setDraft] = useState<any>(null);
  const active = draft ?? edit?.item;
  const save = useMutation({
    mutationFn: async () => {
      if (edit.kind === "source")
        return sourceFn({
          data: {
            id: active.id,
            title: active.title,
            summary: active.summary,
            tier: Number(active.tier),
            tags: splitTags(active.tags),
            audience: active.audience,
            why_it_matters: active.why_it_matters,
          },
        });
      if (edit.kind === "topic")
        return topicFn({
          data: {
            slug: active.slug,
            name: active.name,
            description: active.description,
            parent_slug: active.parent_slug ?? null,
            sort_order: Number(active.sort_order ?? 0),
            active: active.active ?? true,
            tags: splitTags(active.tags),
          },
        });
      if (edit.kind === "capability")
        return capFn({
          data: {
            id: active.id,
            name: active.name,
            description: active.description,
            accent: active.accent,
            maturity: active.maturity ?? "ga",
          },
        });
      if (edit.kind === "help")
        return helpFn({
          data: {
            slug: active.slug,
            title: active.title,
            body_md: active.body_md,
            sort_order: Number(active.sort_order ?? 0),
          },
        });
      return diagramFn({
        data: {
          slug: active.slug,
          caption: active.caption,
          kind: active.kind,
          topic_slug: active.topic_slug ?? null,
          path: active.path,
        },
      });
    },
    onSuccess: () => {
      toast.success("Content updated.");
      setEdit(null);
      setDraft(null);
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  if (!edit) return null;
  const set = (key: string, value: unknown) => setDraft({ ...active, [key]: value });
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
      <DialogContent className="max-h-[85vh] overflow-auto border-border bg-popover text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {edit.kind}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Metadata edits are logged. Claim text and blog body edits use versioned workflows
            elsewhere.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {"title" in active && (
            <Field label="Title" value={active.title ?? ""} onChange={(v) => set("title", v)} />
          )}
          {"name" in active && (
            <Field label="Name" value={active.name ?? ""} onChange={(v) => set("name", v)} />
          )}
          {"caption" in active && (
            <Field
              label="Caption"
              value={active.caption ?? ""}
              onChange={(v) => set("caption", v)}
            />
          )}
          {"summary" in active && (
            <Area
              label="Summary"
              value={active.summary ?? ""}
              onChange={(v) => set("summary", v)}
            />
          )}
          {"description" in active && (
            <Area
              label="Description"
              value={active.description ?? ""}
              onChange={(v) => set("description", v)}
            />
          )}
          {"body_md" in active && (
            <Area
              label="Body"
              value={active.body_md ?? ""}
              onChange={(v) => set("body_md", v)}
              rows={12}
            />
          )}
          {"tier" in active && (
            <Field
              label="Tier"
              type="number"
              value={String(active.tier ?? 6)}
              onChange={(v) => set("tier", v)}
            />
          )}
          {"sort_order" in active && (
            <Field
              label="Sort order"
              type="number"
              value={String(active.sort_order ?? 0)}
              onChange={(v) => set("sort_order", v)}
            />
          )}
          {"path" in active && (
            <Field label="Path" value={active.path ?? ""} onChange={(v) => set("path", v)} />
          )}
          {"kind" in active && (
            <Field label="Kind" value={active.kind ?? ""} onChange={(v) => set("kind", v)} />
          )}
          {"tags" in active && (
            <Field
              label="Tags"
              value={Array.isArray(active.tags) ? active.tags.join(", ") : (active.tags ?? "")}
              onChange={(v) => set("tags", v)}
            />
          )}
          {edit.kind === "capability" && (
            <div>
              <Label className="text-muted-foreground">Maturity</Label>
              <Select value={active.maturity ?? "ga"} onValueChange={(v) => set("maturity", v)}>
                <SelectTrigger className="mt-1 border-border bg-card text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preview">Preview</SelectItem>
                  <SelectItem value="ga">GA</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CreateContentDialog({
  kind,
  setKind,
  capabilities,
  onDone,
}: {
  kind: "topic" | "help" | null;
  setKind: (kind: "topic" | "help" | null) => void;
  capabilities: any[];
  onDone: () => void;
}) {
  const createTopicFn = useServerFn(createTopic);
  const createHelpFn = useServerFn(createHelpDoc);
  const [draft, setDraft] = useState({
    slug: "",
    title: "",
    description: "",
    parent_slug: "",
    sort_order: "0",
    capability_ids: "",
    body_md: "",
  });
  const create = useMutation({
    mutationFn: () => {
      if (kind === "topic") {
        return createTopicFn({
          data: {
            slug: draft.slug,
            name: draft.title,
            description: draft.description,
            parent_slug: draft.parent_slug || null,
            sort_order: Number(draft.sort_order || 0),
            capability_ids: draft.capability_ids
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean),
          },
        });
      }
      return createHelpFn({
        data: {
          slug: draft.slug,
          title: draft.title,
          body_md: draft.body_md || `# ${draft.title}\n`,
          sort_order: Number(draft.sort_order || 0),
        },
      });
    },
    onSuccess: () => {
      toast.success(kind === "topic" ? "Topic created." : "Help doc created.");
      setKind(null);
      setDraft({
        slug: "",
        title: "",
        description: "",
        parent_slug: "",
        sort_order: "0",
        capability_ids: "",
        body_md: "",
      });
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const set = (key: keyof typeof draft, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <Dialog open={!!kind} onOpenChange={(open) => !open && setKind(null)}>
      <DialogContent className="max-h-[85vh] overflow-auto border-border bg-popover text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New {kind === "topic" ? "topic" : "help doc"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create the registry row first; source-controlled content can be backfilled under
            <code> content/</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Slug" value={draft.slug} onChange={(v) => set("slug", v)} />
          <Field label="Title" value={draft.title} onChange={(v) => set("title", v)} />
          <Field
            label="Sort order"
            type="number"
            value={draft.sort_order}
            onChange={(v) => set("sort_order", v)}
          />
          {kind === "topic" ? (
            <>
              <Area
                label="Description"
                value={draft.description}
                onChange={(v) => set("description", v)}
              />
              <Field
                label="Parent slug"
                value={draft.parent_slug}
                onChange={(v) => set("parent_slug", v)}
              />
              <Field
                label="Capability ids"
                value={draft.capability_ids}
                onChange={(v) => set("capability_ids", v)}
              />
              <div className="text-xs text-muted-foreground">
                Available capabilities: {capabilities.map((c) => c.id).join(", ")}
              </div>
            </>
          ) : (
            <Area
              label="Body"
              value={draft.body_md}
              onChange={(v) => set("body_md", v)}
              rows={10}
            />
          )}
        </div>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || !draft.slug.trim() || !draft.title.trim()}
        >
          Create
        </Button>
      </DialogContent>
    </Dialog>
  );
}
