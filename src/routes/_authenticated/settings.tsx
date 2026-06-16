import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BookOpen,
  Check,
  Database,
  FileText,
  Gauge,
  ListChecks,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getCmsData,
  getSettingsOverview,
  inviteUser,
  mutateClaim,
  mutateQueueItem,
  saveBlogVersion,
  setUserRoles,
  submitSourceReview,
  supersedeClaim,
  suspendUser,
  updateInvitationStatus,
  updateCapability,
  updateDiagram,
  updateHelpDoc,
  updateSourceMetadata,
  updateTopicMetadata,
  validateContent,
} from "@/lib/settings.functions";

type AppRole = "admin" | "editor" | "user";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Fabric Atlas" }] }),
  component: SettingsPage,
});

const roleOptions: AppRole[] = ["user", "editor", "admin"];

const nav = [
  { id: "users", label: "Users", icon: UserCog },
  { id: "content", label: "Content", icon: Database },
  { id: "claims", label: "Claims", icon: ListChecks },
  { id: "blogs", label: "Blogs", icon: BookOpen },
  { id: "queue", label: "Queue", icon: FileText },
  { id: "logs", label: "Logs", icon: Activity },
  { id: "system", label: "System", icon: Gauge },
] as const;

function SettingsPage() {
  const overviewFn = useServerFn(getSettingsOverview);
  const cmsFn = useServerFn(getCmsData);
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["settings-overview"], queryFn: () => overviewFn() });
  const cms = useQuery({
    queryKey: ["settings-cms"],
    queryFn: () => cmsFn(),
    enabled: !!overview.data,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settings-overview"] });
    queryClient.invalidateQueries({ queryKey: ["settings-cms"] });
  };

  if (overview.error) {
    return (
      <Shell>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {(overview.error as Error).message === "Forbidden"
            ? "You do not have admin access."
            : (overview.error as Error).message}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
            Administration
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {Object.entries(overview.data?.stats ?? {})
            .slice(0, 4)
            .map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="text-white/45">{key}</div>
                <div className="text-lg font-semibold">{value as number}</div>
              </div>
            ))}
        </div>
      </div>

      <Tabs defaultValue="users" className="mt-7 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <TabsList className="flex h-auto flex-row justify-start gap-1 overflow-x-auto rounded-md border border-white/10 bg-white/[0.03] p-1 md:flex-col md:items-stretch md:overflow-visible">
          {nav.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="justify-start gap-2 text-white/65 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="users" className="mt-0">
            <UsersPanel data={overview.data} onDone={refresh} loading={overview.isLoading} />
          </TabsContent>
          <TabsContent value="content" className="mt-0">
            <ContentPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="claims" className="mt-0">
            <ClaimsPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="blogs" className="mt-0">
            <BlogsPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="queue" className="mt-0">
            <QueuePanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="logs" className="mt-0">
            <LogsPanel
              data={overview.data?.audit ?? cms.data?.audit ?? []}
              loading={overview.isLoading}
            />
          </TabsContent>
          <TabsContent value="system" className="mt-0">
            <SystemPanel stats={overview.data?.stats ?? {}} loading={overview.isLoading} />
          </TabsContent>
        </div>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function statusBadge(status?: string) {
  const cls =
    status === "approved" ||
    status === "verified" ||
    status === "published" ||
    status === "ingested"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : status === "pending" || status === "queued" || status === "draft"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : status === "suspended" || status === "rejected" || status === "failed"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
          : "border-white/15 bg-white/[0.04] text-white/65";
  return <Badge className={`rounded-sm border text-[11px] ${cls}`}>{status ?? "unknown"}</Badge>;
}

function UsersPanel({
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
            className="h-8 border-white/10 bg-white/[0.04] text-white"
          />
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger className="h-8 w-32 border-white/10 bg-white/[0.04] text-white">
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
          <Table className="text-white">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last sign in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((u: any) => (
                <TableRow key={u.id} className="border-white/5 hover:bg-white/[0.03]">
                  <TableCell className="font-medium">{u.email ?? u.id}</TableCell>
                  <TableCell>{statusBadge(u.profile?.status)}</TableCell>
                  <TableCell>
                    <RoleChips roles={u.roles} />
                  </TableCell>
                  <TableCell className="text-white/55">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
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
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
                        onClick={() =>
                          mutate.mutate(rolesFn({ data: { userId: u.id, roles: ["editor"] } }))
                        }
                      >
                        Editor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
              Invitations
            </div>
            <div className="divide-y divide-white/5 rounded-md border border-white/10">
              {(data?.invitations ?? []).map((inv: any) => (
                <div
                  key={inv.id}
                  className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[1fr_120px_120px_160px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{inv.email}</div>
                    <div className="text-xs text-white/45">
                      invited {new Date(inv.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>{statusBadge(inv.status)}</div>
                  <div className="text-white/65">{inv.intended_role}</div>
                  <div className="flex justify-end gap-1">
                    {inv.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-white/10 bg-white/[0.03] text-white"
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
          className="rounded-sm border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-white/65"
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function ContentPanel({
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
  const [edit, setEdit] = useState<{
    kind: "source" | "topic" | "capability" | "help" | "diagram";
    item: any;
  } | null>(null);
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
                <div key={label} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs text-white/45">{label}</div>
                  <div className="text-xl font-semibold">{count}</div>
                </div>
              ))}
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
                  className="h-8 border-white/10 bg-white/[0.03] text-white"
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
            />
            <CompactList
              title="Capabilities"
              rows={data?.capabilities ?? []}
              label={(c) => c.name}
              meta={(c) => c.id}
              onEdit={(item) => setEdit({ kind: "capability", item })}
            />
            <CompactList
              title="Help docs"
              rows={data?.helpDocs ?? []}
              label={(h) => h.title}
              meta={(h) => h.slug}
              onEdit={(item) => setEdit({ kind: "help", item })}
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
              onEdit={() => toast.info("Design body edits stay in content/designs/ for now.")}
              extraAction={(item) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/[0.03] text-white"
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
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
        {title}
      </div>
      <div className="divide-y divide-white/5 rounded-md border border-white/10">
        {rows.slice(0, 8).map((row) => (
          <div
            key={row.id ?? row.slug}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate text-white">{label(row)}</div>
              <div className="truncate text-xs text-white/45">{meta(row)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              {extraAction?.(row)}
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-white/10 bg-white/[0.03] text-white"
                onClick={() => onEdit(row)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
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
      <DialogContent className="max-h-[85vh] overflow-auto border-white/10 bg-[#0b1020] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {edit.kind}</DialogTitle>
          <DialogDescription className="text-white/55">
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
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ClaimsPanel({
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
  const [filter, setFilter] = useState("pending");
  const [edit, setEdit] = useState<any>(null);
  const [newText, setNewText] = useState("");
  const rows = useMemo(
    () => (data?.claims ?? []).filter((c: any) => filter === "all" || c.status === filter),
    [data, filter],
  );
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
  return (
    <>
      <Panel
        title="Claims"
        action={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-36 border-white/10 bg-white/[0.04] text-white">
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
        }
      >
        {loading ? (
          <Empty text="Loading claims..." />
        ) : (
          <Table className="text-white">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>Claim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capability</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 120).map((c: any) => (
                <TableRow key={c.id} className="border-white/5 hover:bg-white/[0.03]">
                  <TableCell>
                    <div className="max-w-2xl text-sm">{c.text}</div>
                    <div className="mt-1 text-xs text-white/40">{c.sources?.title}</div>
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell className="text-white/65">
                    {c.capability_id} · L{c.depth}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
                        onClick={() =>
                          mutate.mutate(actionFn({ data: { claimId: c.id, action: "verify" } }))
                        }
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
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
                          className="h-8 border-white/10 bg-white/[0.03] text-white"
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
        <DialogContent className="border-white/10 bg-[#0b1020] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supersede claim</DialogTitle>
            <DialogDescription className="text-white/55">
              This creates a new pending claim version and deactivates the current version.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={8}
            className="border-white/10 bg-white/[0.04] text-white"
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

function BlogsPanel({
  data,
  onDone,
  loading,
}: {
  data: any;
  onDone: () => void;
  loading: boolean;
}) {
  const saveFn = useServerFn(saveBlogVersion);
  const validateFn = useServerFn(validateContent);
  const [edit, setEdit] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const active = draft ?? edit;
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          existingId: active.id,
          topic_slug: active.topic_slug,
          slug: active.slug?.replace(/@v\d+$/, ""),
          title: active.title,
          summary: active.summary,
          body_md: active.body_md,
          status: "draft",
          cited_source_ids: active.cited_source_ids ?? [],
          tags: active.tags ?? [],
          depth_levels: active.depth_levels ?? [],
        },
      }),
    onSuccess: () => {
      toast.success("Blog version created.");
      setEdit(null);
      setDraft(null);
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const validate = useMutation({
    mutationFn: (id: string) => validateFn({ data: { kind: "blog", id } }),
    onSuccess: () => {
      toast.success("Blog validation queued.");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <>
      <Panel title="Blogs">
        {loading ? (
          <Empty text="Loading blogs..." />
        ) : (
          <Table className="text-white">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.blogs ?? []).map((b: any) => (
                <TableRow key={b.id} className="border-white/5 hover:bg-white/[0.03]">
                  <TableCell>
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-white/40">{b.slug}</div>
                  </TableCell>
                  <TableCell>{statusBadge(b.status)}</TableCell>
                  <TableCell>v{b.version}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
                        onClick={() => validate.mutate(b.id)}
                      >
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
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
        <DialogContent className="max-h-[85vh] overflow-auto border-white/10 bg-[#0b1020] text-white sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Blog version</DialogTitle>
            <DialogDescription className="text-white/55">
              Saving creates a new draft version; it does not mutate the existing article body.
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

function QueuePanel({
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
            className="h-8 border-white/10 bg-white/[0.04] text-white"
          />
          <Input
            value={failure}
            onChange={(e) => setFailure(e.target.value)}
            placeholder="failure note"
            className="h-8 border-white/10 bg-white/[0.04] text-white"
          />
        </div>
      }
    >
      {loading ? (
        <Empty text="Loading queue..." />
      ) : (
        <Table className="text-white">
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.queue ?? []).map((q: any) => (
              <TableRow key={q.id} className="border-white/5 hover:bg-white/[0.03]">
                <TableCell>
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {q.title || q.url}
                  </a>
                  <div className="text-xs text-white/40">{q.notes || q.note}</div>
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
                        className="h-8 border-white/10 bg-white/[0.03] text-white"
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

function LogsPanel({ data, loading }: { data: any[]; loading: boolean }) {
  return (
    <Panel title="Admin audit log">
      {loading ? (
        <Empty text="Loading logs..." />
      ) : (
        <div className="divide-y divide-white/5 rounded-md border border-white/10">
          {data.map((event) => (
            <div
              key={event.id}
              className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[180px_1fr_180px]"
            >
              <div className="text-white/45">{new Date(event.created_at).toLocaleString()}</div>
              <div>
                <span className="font-medium">{event.action}</span>
                <span className="ml-2 text-white/45">
                  {event.target_type}:{event.target_id}
                </span>
              </div>
              <div className="truncate text-xs text-white/45">{event.actor_id}</div>
            </div>
          ))}
          {data.length === 0 && <Empty text="No audit events yet." />}
        </div>
      )}
    </Panel>
  );
}

function SystemPanel({ stats, loading }: { stats: Record<string, number>; loading: boolean }) {
  return (
    <Panel title="System">
      {loading ? (
        <Empty text="Loading system stats..." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
                  <ShieldCheck className="h-4 w-4" />
                  {key}
                </div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
            <div className="font-medium text-white">Content source of truth</div>
            <p className="mt-1">
              Settings writes operational metadata and versioned CMS changes to the backend. Export
              DB-edited content back to <code>content/</code> before treating it as
              source-controlled truth.
            </p>
            <code className="mt-3 block rounded-sm bg-black/30 p-2 text-xs text-teal-100">
              python scripts/import_content.py --dry-run
            </code>
          </div>
        </div>
      )}
    </Panel>
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
      <Label className="text-white/65">Cited sources</Label>
      <div className="mt-1 max-h-48 divide-y divide-white/5 overflow-auto rounded-md border border-white/10">
        {sources.map((source) => (
          <label
            key={source.id}
            className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]"
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
              <span className="block truncate text-white">{source.title}</span>
              <span className="block truncate text-xs text-white/45">
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-white/65">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-white/10 bg-white/[0.04] text-white"
      />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <Label className="text-white/65">{label}</Label>
      <Textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-white/10 bg-white/[0.04] text-white"
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/15 p-8 text-center text-sm text-white/45">
      {text}
    </div>
  );
}

function splitTags(value: unknown) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
