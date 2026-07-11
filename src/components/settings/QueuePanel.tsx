import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { bulkClaimQueueItems, mutateQueueItem, submitSourceUrl } from "@/lib/settings.functions";
import { Empty, Panel, statusBadge } from "@/components/settings/shared";

type QueueAction = "claim" | "complete" | "fail" | "requeue" | "dismiss";

export function QueuePanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const actionFn = useServerFn(mutateQueueItem);
  const bulkClaimFn = useServerFn(bulkClaimQueueItems);
  const [completeItem, setCompleteItem] = useState<any>(null);
  const [failItem, setFailItem] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queuedItems = (data?.queue ?? []).filter((item: any) => item.status === "queued");
  const selectedQueuedIds = queuedItems
    .filter((item: any) => selectedIds.has(item.id))
    .map((item: any) => item.id);
  const mutate = useMutation({
    mutationFn: (task: Promise<unknown>) => task,
    onSuccess: () => {
      toast.success("Queue updated.");
      setCompleteItem(null);
      setFailItem(null);
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const runAction = (
    item: any,
    action: QueueAction,
    extra: { sourceId?: string; error?: string } = {},
  ) => mutate.mutate(actionFn({ data: { itemId: item.id, action, ...extra } }));
  const bulkClaim = useMutation({
    mutationFn: () => bulkClaimFn({ data: { itemIds: selectedQueuedIds } }),
    onSuccess: (result) => {
      toast.success(`${result.claimed} queue item${result.claimed === 1 ? "" : "s"} claimed.`);
      setSelectedIds(new Set());
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const allQueuedSelected =
    queuedItems.length > 0 && queuedItems.every((item: any) => selectedIds.has(item.id));

  return (
    <Panel title="Queue">
      <QueueSubmitForm onDone={onDone} />
      {queuedItems.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={allQueuedSelected}
              onCheckedChange={(checked) =>
                setSelectedIds(
                  checked ? new Set(queuedItems.map((item: any) => item.id)) : new Set(),
                )
              }
            />
            Select all queued ({queuedItems.length})
          </label>
          <Button
            size="sm"
            disabled={!selectedQueuedIds.length || bulkClaim.isPending || mutate.isPending}
            onClick={() => bulkClaim.mutate()}
          >
            {bulkClaim.isPending ? "Claiming…" : `Claim selected (${selectedQueuedIds.length})`}
          </Button>
        </div>
      )}
      {loading ? (
        <Empty text="Loading queue..." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">Select</TableHead>
              <TableHead>Work item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.queue ?? []).map((q: any) => (
              <TableRow key={q.id} className="border-border hover:bg-accent">
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${q.title || q.target_slug || q.url}`}
                    checked={selectedIds.has(q.id)}
                    disabled={q.status !== "queued" || bulkClaim.isPending}
                    onCheckedChange={(checked) => toggleSelected(q.id, checked === true)}
                  />
                </TableCell>
                <TableCell>
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {q.title || q.target_slug || q.url}
                  </a>
                  <div className="text-xs text-muted-foreground">{q.notes}</div>
                </TableCell>
                <TableCell>{statusBadge(q.status)}</TableCell>
                <TableCell>
                  <div className="text-sm">{q.kind ?? "source"}</div>
                  {q.tier && <div className="text-xs text-muted-foreground">T{q.tier}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      disabled={mutate.isPending || q.status !== "queued"}
                      onClick={() => runAction(q, "claim")}
                    >
                      claim
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      disabled={mutate.isPending || !["queued", "claimed"].includes(q.status)}
                      onClick={() =>
                        q.kind === "source" || !q.kind
                          ? setCompleteItem(q)
                          : runAction(q, "complete")
                      }
                    >
                      complete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      disabled={mutate.isPending || !["queued", "claimed"].includes(q.status)}
                      onClick={() => setFailItem(q)}
                    >
                      fail
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      disabled={mutate.isPending || !["failed", "claimed"].includes(q.status)}
                      onClick={() => runAction(q, "requeue")}
                    >
                      requeue
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      disabled={mutate.isPending || !["queued", "failed"].includes(q.status)}
                      onClick={() => runAction(q, "dismiss")}
                    >
                      dismiss
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CompleteDialog
        item={completeItem}
        sources={data?.sources ?? []}
        onOpenChange={(open) => !open && setCompleteItem(null)}
        onComplete={(sourceId) => completeItem && runAction(completeItem, "complete", { sourceId })}
      />
      <FailDialog
        item={failItem}
        onOpenChange={(open) => !open && setFailItem(null)}
        onFail={(error) => failItem && runAction(failItem, "fail", { error })}
      />
    </Panel>
  );
}

function CompleteDialog({
  item,
  sources,
  onOpenChange,
  onComplete,
}: {
  item: any;
  sources: any[];
  onOpenChange: (open: boolean) => void;
  onComplete: (sourceId: string) => void;
}) {
  const [sourceId, setSourceId] = useState("");
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-foreground">
        <DialogHeader>
          <DialogTitle>Complete source queue item</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose the approved source row created by the local ingestion run.
          </DialogDescription>
        </DialogHeader>
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger className="border-border bg-card text-foreground">
            <SelectValue placeholder="Result source" />
          </SelectTrigger>
          <SelectContent>
            {sources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.title} ({source.slug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => onComplete(sourceId)} disabled={!sourceId}>
          Complete
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function FailDialog({
  item,
  onOpenChange,
  onFail,
}: {
  item: any;
  onOpenChange: (open: boolean) => void;
  onFail: (error: string) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-foreground">
        <DialogHeader>
          <DialogTitle>Fail queue item</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Record the reason so the next operator knows what to fix.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={error}
          onChange={(event) => setError(event.target.value)}
          rows={5}
          className="border-border bg-card text-foreground"
        />
        <Button onClick={() => onFail(error)} disabled={!error.trim()}>
          Mark failed
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function QueueSubmitForm({ onDone }: { onDone: () => void }) {
  const submitFn = useServerFn(submitSourceUrl);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("6");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          url: url.trim(),
          title: title.trim() || undefined,
          tier: Number(tier),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Queued. Run /ingest-batch to extract claims from the source.");
      setUrl("");
      setTitle("");
      setTags("");
      setNote("");
      setTier("6");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Queue a source URL
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Adds a <code className="text-teal-300">kind=source</code> item to the ingestion queue. The
        local knowledge-curator agent drains it (
        <code className="text-teal-300">/ingest-batch</code>
        ), extracts cited claims, and writes <code className="text-teal-300">content/sources/</code>
        .
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://learn.microsoft.com/..."
          className="h-8 border-border bg-card text-foreground md:col-span-2"
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="h-8 border-border bg-card text-foreground"
        />
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="h-8 border-border bg-card text-foreground">
            <SelectValue placeholder="Trust tier" />
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
          placeholder="Tags, comma separated (optional)"
          className="h-8 border-border bg-card text-foreground"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes for the curator (optional)"
          className="h-8 border-border bg-card text-foreground"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={() => submit.mutate()}
          disabled={!url.trim() || submit.isPending}
        >
          {submit.isPending ? "Queuing…" : "Queue source"}
        </Button>
      </div>
    </div>
  );
}
