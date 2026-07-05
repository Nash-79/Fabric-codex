import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveContentItemVersion, validateContent } from "@/lib/settings.functions";
import { Area, Empty, Field, Panel, statusBadge } from "@/components/settings/shared";

export function BlogsPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const saveFn = useServerFn(saveContentItemVersion);
  const validateFn = useServerFn(validateContent);
  const [edit, setEdit] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const active = draft ?? edit;
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          kind: "article",
          existingId: active.id,
          topic_slug: active.topic_slug,
          slug: active.slug?.replace(/@v\d+$/, ""),
          title: active.title,
          summary: active.summary,
          body_md: active.body_md,
          status: "published",
          cited_source_ids: active.cited_source_ids ?? [],
          tags: active.tags ?? [],
          depth_levels: active.depth_levels ?? [],
        },
      }),
    onSuccess: () => {
      toast.success("Article version created.");
      setEdit(null);
      setDraft(null);
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const validate = useMutation({
    mutationFn: (id: string) => validateFn({ data: { kind: "article", id } }),
    onSuccess: () => {
      toast.success("Article validation queued.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <>
      <Panel title="Articles">
        {loading ? (
          <Empty text="Loading blogs..." />
        ) : (
          <Table className="text-foreground">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.blogs ?? []).map((b: any) => (
                <TableRow key={b.id} className="border-border hover:bg-accent">
                  <TableCell>
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-muted-foreground">{b.slug}</div>
                  </TableCell>
                  <TableCell>{statusBadge(b.status)}</TableCell>
                  <TableCell>v{b.version}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() => validate.mutate(b.id)}
                      >
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() => setEdit(b)}
                      >
                        Edit as new version
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open) {
            setEdit(null);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-auto border-border bg-popover text-foreground sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Article version</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Saving creates a new published version; it does not mutate the existing article body.
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="grid gap-3">
              <Field
                label="Title"
                value={active.title ?? ""}
                onChange={(v) => setDraft({ ...active, title: v })}
              />
              <Area
                label="Summary"
                value={active.summary ?? ""}
                onChange={(v) => setDraft({ ...active, summary: v })}
              />
              <Area
                label="Body"
                value={active.body_md ?? ""}
                onChange={(v) => setDraft({ ...active, body_md: v })}
                rows={16}
              />
              <CitationSelector
                sources={data?.sources ?? []}
                selected={active.cited_source_ids ?? []}
                onChange={(ids) => setDraft({ ...active, cited_source_ids: ids })}
              />
            </div>
          )}
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !(active?.cited_source_ids ?? []).length}
          >
            Create draft version
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CitationSelector({
  sources,
  selected,
  onChange,
}: {
  sources: any[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const chosen = new Set(selected);
  return (
    <div>
      <Label className="text-muted-foreground">Cited sources</Label>
      <div className="mt-1 max-h-48 divide-y divide-border overflow-auto rounded-md border border-border">
        {sources.map((source) => (
          <label
            key={source.id}
            className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={chosen.has(source.id)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, source.id]
                  : selected.filter((id) => id !== source.id);
                onChange([...new Set(next)]);
              }}
            />
            <span className="min-w-0">
              <span className="block truncate text-foreground">{source.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                T{source.tier} · {source.slug}
              </span>
            </span>
          </label>
        ))}
      </div>
      {!selected.length && (
        <div className="mt-1 text-xs text-amber-200">At least one cited source is required.</div>
      )}
    </div>
  );
}
