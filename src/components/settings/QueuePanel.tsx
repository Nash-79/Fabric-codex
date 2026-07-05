import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { mutateQueueItem, submitSourceUrl } from "@/lib/settings.functions";
import { Empty, Panel, statusBadge } from "@/components/settings/shared";

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
  const [sourceId, setSourceId] = useState("");
  const [failure, setFailure] = useState("");
  const mutate = useMutation({
    mutationFn: (task: Promise<unknown>) => task,
    onSuccess: () => {
      toast.success("Queue updated.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <Panel
      title="Source queue"
      action={
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="result source id"
            className="h-8 border-border bg-card text-foreground"
          />
          <Input
            value={failure}
            onChange={(e) => setFailure(e.target.value)}
            placeholder="failure note"
            className="h-8 border-border bg-card text-foreground"
          />
        </div>
      }
    >
      <QueueSubmitForm onDone={onDone} />
      {loading ? (
        <Empty text="Loading queue..." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.queue ?? []).map((q: any) => (
              <TableRow key={q.id} className="border-border hover:bg-accent">
                <TableCell>
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {q.title || q.url}
                  </a>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {/^discovered via/i.test(q.notes || q.note || "") && (
                      <Badge className="border-teal-400/30 bg-teal-500/10 text-[10px] text-teal-200">
                        discovered
                      </Badge>
                    )}
                    <span>{q.notes || q.note}</span>
                  </div>
                </TableCell>
                <TableCell>{statusBadge(q.status)}</TableCell>
                <TableCell>T{q.tier}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {(["claim", "complete", "fail", "requeue", "dismiss"] as const).map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() =>
                          mutate.mutate(
                            actionFn({
                              data: {
                                itemId: q.id,
                                action: a,
                                sourceId: a === "complete" ? sourceId : undefined,
                                error: a === "fail" ? failure : undefined,
                              },
                            }),
                          )
                        }
                        disabled={a === "complete" && !sourceId}
                      >
                        {a}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
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
          placeholder="https://learn.microsoft.com/…"
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
          placeholder="Note for the curator (optional)"
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
