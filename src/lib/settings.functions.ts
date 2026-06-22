import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = "admin" | "editor" | "user";
type ClaimAction = "verify" | "reject" | "promote" | "dismiss";
type QueueAction = "claim" | "complete" | "fail" | "requeue" | "dismiss";

async function publicClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function adminServices() {
  return import("@/lib/atlas-admin.services.server");
}

async function recordAudit(
  actorId: string,
  action: string,
  targetType = "",
  targetId = "",
  metadata: Record<string, unknown> = {},
) {
  const sb = await adminClient();
  await sb.from("admin_audit_events").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}

function uniqueRoles(roles?: AppRole[]) {
  const out = [...new Set(roles?.length ? roles : ["user"])];
  return out.filter((r): r is AppRole => ["admin", "editor", "user"].includes(r));
}

export const getSettingsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const publicSb = await publicClient();

    const [
      usersPage,
      { data: profiles },
      { data: roles },
      { data: invitations },
      { data: audit },
      stats,
    ] = await Promise.all([
      sb.auth.admin.listUsers({ page: 1, perPage: 200 }),
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("user_roles").select("user_id,role,created_at"),
      sb.from("user_invitations").select("*").order("created_at", { ascending: false }).limit(50),
      sb
        .from("admin_audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      adminStats(publicSb),
    ]);

    const roleMap = new Map<string, AppRole[]>();
    for (const row of roles ?? []) {
      const current = roleMap.get(row.user_id) ?? [];
      current.push(row.role);
      roleMap.set(row.user_id, current);
    }
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const users = (usersPage.data?.users ?? []).map((user: any) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      profile: profileMap.get(user.id) ?? null,
      roles: roleMap.get(user.id) ?? [],
    }));

    return {
      users,
      invitations: invitations ?? [],
      audit: audit ?? [],
      stats,
    };
  });

async function adminStats(sb: any) {
  const tables = [
    "topics",
    "capabilities",
    "sources",
    "claims",
    "blogs",
    "diagrams",
    "help_docs",
    "queue_items",
  ] as const;
  const counts: Record<string, number> = {};
  await Promise.all(
    tables.map(async (t) => {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }),
  );
  return counts;
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role?: AppRole }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("A valid email is required.");
    const role = data.role ?? "user";
    const sb = await adminClient();
    const { data: invited, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { intended_role: role },
    });
    if (error) throw new Error(error.message);
    await sb.from("user_invitations").insert({
      email,
      intended_role: role,
      invited_by: context.userId,
      accepted_user_id: invited?.user?.id ?? null,
    });
    await recordAudit(context.userId, "user.invited", "user", invited?.user?.id ?? email, {
      email,
      role,
    });
    return { ok: true, user_id: invited?.user?.id ?? null };
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roles?: AppRole[] }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const roles = uniqueRoles(data.roles);
    const { error } = await (context.supabase as any).rpc("admin_approve_user", {
      _user_id: data.userId,
      _roles: roles,
    });
    if (error) throw new Error(error.message);
    const sb = await adminClient();
    const { data: userPage } = await sb.auth.admin.getUserById(data.userId);
    const email = userPage?.user?.email?.toLowerCase();
    if (email) {
      await sb
        .from("user_invitations")
        .update({
          status: "accepted",
          accepted_user_id: data.userId,
          accepted_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("status", "pending");
    }
    return { ok: true };
  });

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roles: AppRole[] }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const roles = uniqueRoles(data.roles);
    const { error } = await (context.supabase as any).rpc("admin_set_user_roles", {
      _user_id: data.userId,
      _roles: roles,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await (context.supabase as any).rpc("admin_suspend_user", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateInvitationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invitationId: string; status: "revoked" | "expired" }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("user_invitations")
      .update({ status: data.status })
      .eq("id", data.invitationId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    await recordAudit(
      context.userId,
      `invitation.${data.status}`,
      "user_invitation",
      data.invitationId,
    );
    return { ok: true };
  });

export const getCmsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const [
      { data: sources },
      { data: claims },
      { data: blogs },
      { data: blogSources },
      { data: designs },
      { data: topics },
      { data: capabilities },
      { data: queue },
      { data: diagrams },
      { data: helpDocs },
      { data: audit },
    ] = await Promise.all([
      sb.from("sources").select("*").order("created_at", { ascending: false }).limit(200),
      sb
        .from("claims")
        .select("*,sources(id,slug,title,tier,url)")
        .order("created_at", { ascending: false })
        .limit(300),
      sb.from("blogs").select("*").order("updated_at", { ascending: false }).limit(100),
      sb.from("blog_sources").select("blog_id,source_id,label,position").order("position"),
      sb.from("designs").select("*").order("updated_at", { ascending: false }).limit(100),
      sb.from("topics").select("*").order("sort_order").order("name"),
      sb.from("capabilities").select("*").order("name"),
      sb.from("queue_items").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("diagrams").select("*").order("created_at", { ascending: false }),
      sb.from("help_docs").select("*").order("sort_order"),
      sb
        .from("admin_audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const blogCitationMap = new Map<string, string[]>();
    for (const row of blogSources ?? []) {
      const current = blogCitationMap.get(row.blog_id) ?? [];
      current.push(row.source_id);
      blogCitationMap.set(row.blog_id, current);
    }
    return {
      sources: sources ?? [],
      claims: claims ?? [],
      blogs: (blogs ?? []).map((b: any) => ({
        ...b,
        cited_source_ids: blogCitationMap.get(b.id) ?? [],
      })),
      designs: designs ?? [],
      topics: topics ?? [],
      capabilities: capabilities ?? [],
      queue: queue ?? [],
      diagrams: diagrams ?? [],
      helpDocs: helpDocs ?? [],
      audit: audit ?? [],
    };
  });

export const updateSourceMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      title: string;
      summary?: string;
      tier: number;
      tags?: string[];
      audience?: string;
      why_it_matters?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("sources")
      .update({
        title: data.title,
        summary: data.summary ?? "",
        tier: data.tier,
        tags: data.tags ?? [],
        audience: data.audience ?? "",
        why_it_matters: data.why_it_matters ?? "",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "source.metadata_updated", "source", data.id);
    return { ok: true };
  });

export const updateCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string; description?: string; accent?: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("capabilities")
      .update({
        name: data.name,
        description: data.description ?? "",
        accent: data.accent ?? "teal",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "capability.updated", "capability", data.id);
    return { ok: true };
  });

export const updateTopicMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      slug: string;
      name: string;
      description?: string;
      parent_slug?: string | null;
      sort_order?: number;
      active?: boolean;
      tags?: string[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("topics")
      .update({
        name: data.name,
        description: data.description ?? "",
        parent_slug: data.parent_slug ?? null,
        sort_order: data.sort_order ?? 0,
        active: data.active ?? true,
        tags: data.tags ?? [],
      })
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "topic.updated", "topic", data.slug);
    return { ok: true };
  });

export const updateHelpDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string; title: string; body_md: string; sort_order?: number }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("help_docs")
      .update({
        title: data.title,
        body_md: data.body_md,
        sort_order: data.sort_order ?? 0,
      })
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "help.updated", "help_doc", data.slug);
    return { ok: true };
  });

export const updateDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      slug: string;
      caption: string;
      kind?: string;
      topic_slug?: string | null;
      path: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("diagrams")
      .update({
        caption: data.caption,
        kind: data.kind ?? "architecture",
        topic_slug: data.topic_slug ?? null,
        path: data.path,
      })
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "diagram.updated", "diagram", data.slug);
    return { ok: true };
  });

export const mutateClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { claimId: string; action: ClaimAction }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { mutateClaimStatus } = await adminServices();
    await mutateClaimStatus(sb, data.claimId, data.action);
    await recordAudit(context.userId, `claim.${data.action}`, "claim", data.claimId);
    return { ok: true };
  });

export const supersedeClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { claimId: string; text: string; depth?: number; type?: string; tags?: string[] }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const text = data.text.trim();
    if (!text) throw new Error("Claim text is required.");
    const sb = await adminClient();
    const { supersedeClaim } = await adminServices();
    const created = await supersedeClaim(sb, data.claimId, {
      text,
      depth: data.depth,
      type: data.type,
      tags: data.tags ?? [],
    });
    await recordAudit(context.userId, "claim.superseded", "claim", created.id, {
      supersedes_id: data.claimId,
    });
    return { ok: true, claim: created };
  });

export const saveBlogVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      existingId?: string;
      topic_slug?: string | null;
      slug: string;
      title: string;
      summary?: string;
      body_md: string;
      status?: string;
      cited_source_ids?: string[];
      tags?: string[];
      depth_levels?: number[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (!data.title.trim() || !data.body_md.trim()) throw new Error("Title and body are required.");
    if (!data.cited_source_ids?.length) throw new Error("At least one cited source is required.");
    const sb = await adminClient();
    let prior: any = null;
    if (data.existingId) {
      const { data: existing, error } = await sb
        .from("blogs")
        .select("*")
        .eq("id", data.existingId)
        .single();
      if (error) throw new Error(error.message);
      prior = existing;
    } else {
      const { data: existing } = await sb
        .from("blogs")
        .select("*")
        .eq("slug", data.slug)
        .eq("active", true)
        .maybeSingle();
      prior = existing;
    }

    const { saveBlogVersion: saveBlogVersionRecord } = await adminServices();
    const created = await saveBlogVersionRecord(sb, {
      existingId: data.existingId,
      topic_slug: data.topic_slug ?? prior?.topic_slug,
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? "",
      body_md: data.body_md,
      status: data.status ?? "draft",
      cited_source_ids: data.cited_source_ids,
      tags: data.tags ?? [],
      depth_levels: data.depth_levels ?? [],
    });

    await recordAudit(
      context.userId,
      prior ? "blog.version_created" : "blog.created",
      "blog",
      created.id,
      {
        slug: data.slug,
        supersedes_id: prior?.id ?? null,
      },
    );
    return { ok: true, blog: created };
  });

export const mutateQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { itemId: string; action: QueueAction; sourceId?: string; error?: string }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { mutateQueueItem: mutateQueueItemRecord } = await adminServices();
    await mutateQueueItemRecord(sb, data.itemId, data.action, {
      sourceId: data.sourceId,
      error: data.error,
    });
    await recordAudit(context.userId, `queue.${data.action}`, "queue_item", data.itemId);
    return { ok: true };
  });

type DiagramCoverageRow = {
  slug: string;
  name: string;
  diagram_count: number;
  has_diagram: boolean;
  commission_open: boolean;
};

type DiagramCoverageResult = {
  coverage: DiagramCoverageRow[];
  pending: Array<Record<string, unknown>>;
};

export const getDiagramCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  // @ts-expect-error TanStack ServerFn type-instantiation depth limit with the fully-typed
  // Supabase context (same as validateContent). Runtime + build are correct.
  .handler(async ({ context }): Promise<DiagramCoverageResult> => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { getDiagramCoverage: getDiagramCoverageRecord } = await adminServices();
    return getDiagramCoverageRecord(sb);
  });

export const commissionDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetSlug: string; title?: string; scheduledAt?: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { commissionDiagram: commissionDiagramRecord } = await adminServices();
    await commissionDiagramRecord(sb, {
      targetSlug: data.targetSlug,
      title: data.title,
      scheduledAt: data.scheduledAt,
    });
    await recordAudit(
      context.userId,
      "diagram.commissioned",
      "topic",
      data.targetSlug,
      data.scheduledAt ? { scheduled_at: data.scheduledAt } : undefined,
    );
    return { ok: true };
  });

export const submitSourceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceId: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { data: source, error } = await sb
      .from("sources")
      .select("id,slug,url,title,tier,tags")
      .eq("id", data.sourceId)
      .single();
    if (error || !source) throw new Error(error?.message ?? "Source not found");
    const note = data.note ?? `Admin re-ingest/drift review for ${source.slug}`;
    const { data: queued, error: queueError } = await sb
      .from("queue_items")
      .insert({
        url: source.url,
        title: source.title,
        tier: source.tier,
        tags: source.tags ?? [],
        note,
        notes: note,
        submitted_by: context.userId,
        status: "queued",
      })
      .select("*")
      .single();
    if (queueError) throw new Error(queueError.message);
    await recordAudit(context.userId, "source.review_requested", "source", data.sourceId, {
      queue_id: queued.id,
    });
    return { ok: true, queue: queued };
  });

export const validateContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "blog" | "design"; id: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
    const sb = await adminClient();
    const { validateContent: validateContentRecord } = await adminServices();
    const result = (await validateContentRecord(sb, data)) as JsonValue;
    await recordAudit(context.userId, `${data.kind}.validation_run`, data.kind, data.id);
    return { ok: true as const, result };
  });
