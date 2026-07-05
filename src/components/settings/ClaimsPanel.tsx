import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { bulkVerifyClaims, mutateClaim, supersedeClaim } from "@/lib/settings.functions";
import { Empty, Panel, statusBadge } from "@/components/settings/shared";

export function ClaimsPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const actionFn = useServerFn(mutateClaim);
  const supersedeFn = useServerFn(supersedeClaim);
  const bulkVerifyFn = useServerFn(bulkVerifyClaims);
  const [filter, setFilter] = useState("pending");
  const [edit, setEdit] = useState<any>(null);
  const [newText, setNewText] = useState("");
  const rows = useMemo(
    () => (data?.claims ?? []).filter((c: any) => filter === "all" || c.status === filter),
    [data, filter],
  );
  // Capabilities that still have pending+active claims — the bulk-verify targets.
  const pendingCaps = useMemo(() => {
    const caps = new Map<string, number>();
    for (const c of data?.claims ?? []) {
      if (c.status === "pending" && c.active !== false && c.capability_id) {
        caps.set(c.capability_id, (caps.get(c.capability_id) ?? 0) + 1);
      }
    }
    return [...caps.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);
  const totalPending = useMemo(
    () =>
      (data?.claims ?? []).filter((c: any) => c.status === "pending" && c.active !== false).length,
    [data],
  );
  const [bulkCap, setBulkCap] = useState("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const mutate = useMutation({
    mutationFn: (task: Promise<unknown>) => task,
    onSuccess: () => {
      toast.success("Claim updated.");
      setEdit(null);
      setNewText("");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const bulkVerify = useMutation({
    mutationFn: (input: { capabilityId?: string; scope?: "all" }) => bulkVerifyFn({ data: input }),
    onSuccess: (res) => {
      const { verified = 0 } = (res ?? {}) as { verified?: number };
      toast.success(`Verified ${verified} pending claim(s).`);
      setBulkCap("");
      setConfirmAllOpen(false);
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <>
      <Panel
        title="Claims"
        action={
          <div className="flex items-center gap-2">
            {pendingCaps.length > 0 && (
              <>
                <Select value={bulkCap} onValueChange={setBulkCap}>
                  <SelectTrigger className="h-8 w-52 border-border bg-card text-foreground">
                    <SelectValue placeholder="Verify all pending in…" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingCaps.map(([cap, n]) => (
                      <SelectItem key={cap} value={cap}>
                        {cap} ({n})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => bulkCap && bulkVerify.mutate(bulkCap)}
                  disabled={!bulkCap || bulkVerify.isPending}
                >
                  {bulkVerify.isPending ? "Verifying…" : "Verify all"}
                </Button>
              </>
            )}
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-36 border-border bg-card text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["pending", "verified", "duplicate", "rejected", "superseded", "all"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {loading ? (
          <Empty text="Loading claims..." />
        ) : (
          <Table className="text-foreground">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Claim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capability</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 120).map((c: any) => (
                <TableRow key={c.id} className="border-border hover:bg-accent">
                  <TableCell>
                    <div className="max-w-2xl text-sm">{c.text}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{c.sources?.title}</div>
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.capability_id} · L{c.depth}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() =>
                          mutate.mutate(actionFn({ data: { claimId: c.id, action: "verify" } }))
                        }
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() => {
                          setEdit(c);
                          setNewText(c.text);
                        }}
                      >
                        Supersede
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-rose-400/20 bg-rose-500/10 text-rose-200"
                        onClick={() =>
                          mutate.mutate(
                            actionFn({
                              data: {
                                claimId: c.id,
                                action: c.status === "duplicate" ? "dismiss" : "reject",
                              },
                            }),
                          )
                        }
                      >
                        Reject
                      </Button>
                      {c.status === "duplicate" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border bg-card text-foreground"
                          onClick={() =>
                            mutate.mutate(actionFn({ data: { claimId: c.id, action: "promote" } }))
                          }
                        >
                          Promote
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="border-border bg-popover text-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supersede claim</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This creates a new pending claim version and deactivates the current version.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={8}
            className="border-border bg-card text-foreground"
          />
          <Button
            onClick={() =>
              mutate.mutate(
                supersedeFn({
                  data: {
                    claimId: edit.id,
                    text: newText,
                    depth: edit.depth,
                    type: edit.type,
                    tags: edit.tags ?? [],
                  },
                }),
              )
            }
          >
            Create new version
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
