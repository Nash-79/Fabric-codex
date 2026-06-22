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
  Image as ImageIcon,
  ListChecks,
  MailPlus,
  RefreshCw,
  Rss,
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
  commissionDiagram,
  getCmsData,
  getDiagramCoverage,
  getSettingsOverview,
  inviteUser,
  mutateClaim,
  mutateQueueItem,
  addRssSubscription,
  deleteRssSubscription,
  listRssSubscriptions,
  saveBlogVersion,
  setRssSubscriptionStatus,
  setUserRoles,
  submitSourceReview,
  submitSourceUrl,
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
  { id: "diagrams", label: "Diagrams", icon: ImageIcon },
  { id: "rss", label: "RSS Feeds", icon: Rss },
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
              <div key={key} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-muted-foreground">{key}</div>
                <div className="text-lg font-semibold">{value as number}</div>
              </div>
            ))}
        </div>
      </div>

      <Tabs defaultValue="users" className="mt-7 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <TabsList className="flex h-auto flex-row justify-start gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 md:flex-col md:items-stretch md:overflow-visible">
          {nav.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="justify-start gap-2 text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground"
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
          <TabsContent value="diagrams" className="mt-0">
            <DiagramsPanel />
          </TabsContent>
          <TabsContent value="rss" className="mt-0">
            <RssPanel />
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
    <div className="min-h-screen bg-background text-foreground">
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
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
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
          : "border-border bg-card text-muted-foreground";
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
                <div key={label} className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
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
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.slice(0, 8).map((row) => (
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
            <DialogTitle>Blog version</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
                  <div className="text-xs text-muted-foreground">{q.notes || q.note}</div>
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

function LogsPanel({ data, loading }: { data: any[]; loading: boolean }) {
  return (
    <Panel title="Admin audit log">
      {loading ? (
        <Empty text="Loading logs..." />
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {data.map((event) => (
            <div
              key={event.id}
              className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[180px_1fr_180px]"
            >
              <div className="text-muted-foreground">
                {new Date(event.created_at).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">{event.action}</span>
                <span className="ml-2 text-muted-foreground">
                  {event.target_type}:{event.target_id}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{event.actor_id}</div>
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
              <div key={key} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  {key}
                </div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Content source of truth</div>
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
      <Label className="text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-border bg-card text-foreground"
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
      <Label className="text-muted-foreground">{label}</Label>
      <Textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-border bg-card text-foreground"
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
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

function intervalToIso(interval: string): string {
  if (interval === "now") return "";
  const days = interval === "1week" ? 7 : interval === "1month" ? 30 : 0;
  if (!days) return "";
  // Build the schedule offset without Date.now math in the type layer; the server
  // accepts ISO-8601 and treats a future timestamp as "not yet claimable".
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function DiagramsPanel() {
  const coverageFn = useServerFn(getDiagramCoverage);
  const commissionFn = useServerFn(commissionDiagram);
  const queryClient = useQueryClient();
  const cov = useQuery({
    queryKey: ["diagram-coverage"],
    queryFn: () => coverageFn(),
  });
  const [interval, setInterval] = useState<string>("now");

  const commission = useMutation({
    mutationFn: (slug: string) =>
      commissionFn({ data: { targetSlug: slug, scheduledAt: intervalToIso(interval) } }),
    onSuccess: () => {
      toast.success("Diagram commissioned. The diagram-author agent will fulfil the queue.");
      queryClient.invalidateQueries({ queryKey: ["diagram-coverage"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // The server-fn return type is erased across the RPC boundary; assert the shape here.
  type CovRow = {
    slug: string;
    name: string;
    diagram_count: number;
    has_diagram: boolean;
    commission_open: boolean;
  };
  const result = cov.data as { coverage: CovRow[]; pending: unknown[] } | undefined;
  const rows: CovRow[] = result?.coverage ?? [];
  const pending = result?.pending ?? [];

  return (
    <Panel
      title="Diagram coverage & commissioning"
      action={
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
      }
    >
      {cov.isLoading ? (
        <Empty text="Loading diagram coverage..." />
      ) : rows.length === 0 ? (
        <Empty text="No topics found. Seed content first." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Commissioning enqueues a <code className="text-teal-300">kind=diagram</code> task. The
            local diagram-author agent drains it (
            <code className="text-teal-300">/commission-diagrams</code>), writes an original SVG,
            and posts it as a generated asset — the server never calls an LLM.
          </p>
          <Table className="text-foreground">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Topic</TableHead>
                <TableHead>Diagrams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.slug} className="border-border hover:bg-accent">
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.diagram_count}</TableCell>
                  <TableCell>
                    {r.commission_open ? (
                      <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                        commissioned
                      </Badge>
                    ) : r.has_diagram ? (
                      <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                        covered
                      </Badge>
                    ) : (
                      <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200">gap</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={r.commission_open || commission.isPending}
                      onClick={() => commission.mutate(r.slug)}
                      className="h-7 border-border bg-transparent text-xs text-muted-foreground hover:bg-accent"
                    >
                      Commission
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pending.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {pending.length} diagram commission(s) pending in the queue.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

type RssRow = {
  id: string;
  feed_url: string;
  title: string;
  default_tier: number;
  status: "active" | "paused";
  last_polled_at: string | null;
  error_count: number;
  last_error: string;
};

function RssPanel() {
  const listFn = useServerFn(listRssSubscriptions);
  const addFn = useServerFn(addRssSubscription);
  const statusFn = useServerFn(setRssSubscriptionStatus);
  const deleteFn = useServerFn(deleteRssSubscription);
  const queryClient = useQueryClient();

  const subs = useQuery({ queryKey: ["rss-subscriptions"], queryFn: () => listFn() });
  const [feedUrl, setFeedUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("6");
  const [tags, setTags] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rss-subscriptions"] });

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          feedUrl: feedUrl.trim(),
          title: title.trim() || undefined,
          defaultTier: Number(tier),
          defaultTags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Subscribed. Run /poll-rss-feeds to queue new posts.");
      setFeedUrl("");
      setTitle("");
      setTags("");
      setTier("6");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (row: RssRow) =>
      statusFn({ data: { id: row.id, status: row.status === "active" ? "paused" : "active" } }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subscription removed.");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rows = (subs.data as { subscriptions: RssRow[] } | undefined)?.subscriptions ?? [];

  return (
    <Panel title="RSS feed subscriptions">
      <p className="mb-3 text-xs text-muted-foreground">
        Subscribe to a blog's RSS/Atom feed (e.g. the Fabric Updates Blog). The local{" "}
        <code className="text-teal-300">/poll-rss-feeds</code> agent fetches each active feed,
        dedupes new entries against existing sources and the queue, and adds them as{" "}
        <code className="text-teal-300">kind=source</code> items — then{" "}
        <code className="text-teal-300">/ingest-batch</code> extracts cited claims. The server
        stores subscriptions; it never polls on its own. Schedule polling with{" "}
        <code className="text-teal-300">/loop 6h /poll-rss-feeds</code> if you want it hands-off.
      </p>

      <div className="mb-4 grid gap-2 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://…/feed or .../rss"
          className="h-8 border-border bg-card text-foreground md:col-span-2"
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feed name (optional)"
          className="h-8 border-border bg-card text-foreground"
        />
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="h-8 border-border bg-card text-foreground">
            <SelectValue placeholder="Default tier" />
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
          placeholder="Default tags, comma separated (optional)"
          className="h-8 border-border bg-card text-foreground md:col-span-2"
        />
        <div className="flex justify-end md:col-span-2">
          <Button
            size="sm"
            onClick={() => add.mutate()}
            disabled={!feedUrl.trim() || add.isPending}
          >
            {add.isPending ? "Subscribing…" : "Subscribe"}
          </Button>
        </div>
      </div>

      {subs.isLoading ? (
        <Empty text="Loading subscriptions..." />
      ) : rows.length === 0 ? (
        <Empty text="No feeds subscribed yet." />
      ) : (
        <Table className="text-foreground">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Feed</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last polled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="border-border hover:bg-accent">
                <TableCell>
                  <a
                    href={r.feed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-200 hover:underline"
                  >
                    {r.title || r.feed_url}
                  </a>
                  {r.error_count > 0 && (
                    <div className="text-xs text-rose-300">
                      {r.error_count} error(s): {r.last_error}
                    </div>
                  )}
                </TableCell>
                <TableCell>T{r.default_tier}</TableCell>
                <TableCell>
                  {r.status === "active" ? (
                    <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                      active
                    </Badge>
                  ) : (
                    <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                      paused
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.last_polled_at ? new Date(r.last_polled_at).toLocaleString() : "never"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      onClick={() => toggle.mutate(r)}
                      disabled={toggle.isPending}
                    >
                      {r.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border bg-card text-foreground"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
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
