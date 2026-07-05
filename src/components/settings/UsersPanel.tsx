import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MailPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  approveUser,
  inviteUser,
  setUserRoles,
  suspendUser,
  updateInvitationStatus,
} from "@/lib/settings.functions";
import { Empty, Panel, roleOptions, statusBadge, type AppRole } from "@/components/settings/shared";

export function UsersPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const inviteFn = useServerFn(inviteUser);
  const approveFn = useServerFn(approveUser);
  const rolesFn = useServerFn(setUserRoles);
  const suspendFn = useServerFn(suspendUser);
  const invitationFn = useServerFn(updateInvitationStatus);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("user");

  const mutate = useMutation({
    mutationFn: (task: Promise<unknown>) => task,
    onSuccess: () => {
      toast.success("User administration updated.");
      setEmail("");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Panel
      title="Users"
      action={
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate(inviteFn({ data: { email, role } }));
          }}
        >
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-8 border-border bg-card text-foreground"
          />
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger className="h-8 w-32 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={mutate.isPending || !email}>
            <MailPlus className="mr-2 h-4 w-4" />
            Invite
          </Button>
        </form>
      }
    >
      {loading ? (
        <Empty text="Loading users..." />
      ) : (
        <div className="space-y-5">
          <Table className="text-foreground">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last sign in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((u: any) => (
                <TableRow key={u.id} className="border-border hover:bg-accent">
                  <TableCell className="font-medium">{u.email ?? u.id}</TableCell>
                  <TableCell>{statusBadge(u.profile?.status)}</TableCell>
                  <TableCell>
                    <RoleChips roles={u.roles} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() =>
                          mutate.mutate(
                            approveFn({
                              data: { userId: u.id, roles: u.roles?.length ? u.roles : ["user"] },
                            }),
                          )
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() =>
                          mutate.mutate(rolesFn({ data: { userId: u.id, roles: ["editor"] } }))
                        }
                      >
                        Editor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-foreground"
                        onClick={() =>
                          mutate.mutate(rolesFn({ data: { userId: u.id, roles: ["admin"] } }))
                        }
                      >
                        Admin
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-rose-400/20 bg-rose-500/10 text-rose-200"
                        onClick={() => mutate.mutate(suspendFn({ data: { userId: u.id } }))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invitations
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              {(data?.invitations ?? []).map((inv: any) => (
                <div
                  key={inv.id}
                  className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[1fr_120px_120px_160px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      invited {new Date(inv.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>{statusBadge(inv.status)}</div>
                  <div className="text-muted-foreground">{inv.intended_role}</div>
                  <div className="flex justify-end gap-1">
                    {inv.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border bg-card text-foreground"
                          onClick={() =>
                            mutate.mutate(
                              invitationFn({
                                data: { invitationId: inv.id, status: "expired" },
                              }),
                            )
                          }
                        >
                          Expire
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-rose-400/20 bg-rose-500/10 text-rose-200"
                          onClick={() =>
                            mutate.mutate(
                              invitationFn({
                                data: { invitationId: inv.id, status: "revoked" },
                              }),
                            )
                          }
                        >
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {(data?.invitations ?? []).length === 0 && <Empty text="No invitations yet." />}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function RoleChips({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(roles?.length ? roles : ["none"]).map((r) => (
        <span
          key={r}
          className="rounded-sm border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {r}
        </span>
      ))}
    </div>
  );
}
