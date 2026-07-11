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
  actorId: string | null,
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
      { data: claimLog },
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
      sb.from("claimevents").select("*").order("actioned_at", { ascending: false }).limit(100),
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

    // Resolve actor UUIDs to emails so the Logs tab reads like activity, not raw ids.
    const emailById = new Map((usersPage.data?.users ?? []).map((u: any) => [u.id, u.email]));
    const auditWithActor = (audit ?? []).map((e: any) => ({
      ...e,
      actor_email: emailById.get(e.actor_id) ?? null,
    }));

    return {
      users,
      invitations: invitations ?? [],
      audit: auditWithActor,
      claimLog: claimLog ?? [],
      stats,
    };
  });

async function adminStats(sb: any) {
  // Content lives in content_items (kind = article | design | lesson) — the old `blogs`
  // table is retired, so counting it here silently reported 0 forever.
  const tables = [
    "topics",
    "capabilities",
    "sources",
    "claims",
    "diagrams",
    "help_docs",
    "queue_items",
  ] as const;
  const kinds = ["article", "design", "lesson"] as const;
  const counts: Record<string, number> = {};
  await Promise.all([
    ...tables.map(async (t) => {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }),
    ...kinds.map(async (kind) => {
      const { count } = await sb
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("kind", kind)
        .eq("active", true);
      counts[`${kind}s`] = count ?? 0;
    }),
  ]);
  return counts;
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { email: string; role?: AppRole }) => d)
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
  .validator((d: { userId: string; roles?: AppRole[] }) => d)
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
  .validator((d: { userId: string; roles: AppRole[] }) => d)
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
  .validator((d: { userId: string }) => d)
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
  .validator((d: { invitationId: string; status: "revoked" | "expired" }) => d)
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
      { data: contentItems },
      { data: contentItemSources },
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
      sb.from("content_items").select("*").order("updated_at", { ascending: false }).limit(300),
      sb
        .from("content_item_sources")
        .select("content_item_id,source_id,label,position")
        .order("position"),
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
    const citationMap = new Map<string, string[]>();
    for (const row of contentItemSources ?? []) {
      const current = citationMap.get(row.content_item_id) ?? [];
      current.push(row.source_id);
      citationMap.set(row.content_item_id, current);
    }
    const withCitations = (items: any[]) =>
      items.map((item) => ({ ...item, cited_source_ids: citationMap.get(item.id) ?? [] }));
    const byKind = (kind: string) =>
      withCitations((contentItems ?? []).filter((i: any) => i.kind === kind));
    return {
      sources: sources ?? [],
      claims: claims ?? [],
      // Unified list across all three kinds, for panels that want to filter/sort themselves.
      contentItems: withCitations(contentItems ?? []),
      // Deprecated per-kind aliases kept for one release so not-yet-migrated panel code keeps working.
      blogs: byKind("article"),
      designs: byKind("design"),
      lessons: byKind("lesson"),
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
  .validator(
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
  .validator(
    (d: { id: string; name: string; description?: string; accent?: string; maturity?: string }) =>
      d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (data.maturity && !["preview", "ga", "deprecated"].includes(data.maturity)) {
      throw new Error("Maturity must be preview, ga, or deprecated.");
    }
    const sb = await adminClient();
    const { error } = await sb
      .from("capabilities")
      .update({
        name: data.name,
        description: data.description ?? "",
        accent: data.accent ?? "teal",
        ...(data.maturity ? { maturity: data.maturity } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "capability.updated", "capability", data.id, {
      maturity: data.maturity,
    });
    return { ok: true };
  });

export const updateTopicMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
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

export const createTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      slug: string;
      name: string;
      description?: string;
      parent_slug?: string | null;
      sort_order?: number;
      tags?: string[];
      capability_ids?: string[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const slug = data.slug.trim().toLowerCase();
    if (!slug || !data.name.trim()) throw new Error("Slug and name are required.");
    const sb = await adminClient();
    const { error } = await sb.from("topics").insert({
      slug,
      name: data.name.trim(),
      description: data.description ?? "",
      parent_slug: data.parent_slug ?? null,
      sort_order: data.sort_order ?? 0,
      tags: data.tags ?? [],
      active: true,
    });
    if (error) throw new Error(error.message);
    const links = (data.capability_ids ?? []).map((capability_id) => ({
      topic_slug: slug,
      capability_id,
    }));
    if (links.length) {
      const { error: linkError } = await sb.from("topic_capabilities").insert(links);
      if (linkError) throw new Error(linkError.message);
    }
    await recordAudit(context.userId, "topic.created", "topic", slug);
    return { ok: true as const, slug };
  });

export const deactivateTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb.from("topics").update({ active: false }).eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "topic.deactivated", "topic", data.slug);
    return { ok: true as const };
  });

export const updateHelpDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string; title: string; body_md: string; sort_order?: number }) => d)
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

export const createHelpDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string; title: string; body_md?: string; sort_order?: number }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const slug = data.slug.trim().toLowerCase();
    if (!slug || !data.title.trim()) throw new Error("Slug and title are required.");
    const sb = await adminClient();
    const { error } = await sb.from("help_docs").insert({
      slug,
      title: data.title.trim(),
      body_md: data.body_md ?? `# ${data.title.trim()}\n`,
      sort_order: data.sort_order ?? 0,
    });
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "help.created", "help_doc", slug);
    return { ok: true as const, slug };
  });

export const deleteHelpDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb.from("help_docs").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "help.deleted", "help_doc", data.slug);
    return { ok: true as const };
  });

export const updateDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      slug: string;
      caption: string;
      kind?: string;
      topic_slug?: string | null;
      capability_id?: string | null;
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
        capability_id: data.capability_id ?? null,
        path: data.path,
      })
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "diagram.updated", "diagram", data.slug);
    return { ok: true };
  });

function assertSafeSvg(svgText: string) {
  const text = svgText.trim();
  if (new TextEncoder().encode(text).length > 512 * 1024) {
    throw new Error("SVG must be 512KB or smaller.");
  }
  if (!/^(<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(text)) {
    throw new Error("Only SVG documents are supported.");
  }
  if (/<script\b/i.test(text) || /\son[a-z]+\s*=/i.test(text) || /javascript:/i.test(text)) {
    throw new Error("SVG contains script, event handlers, or javascript: URLs.");
  }
  return text;
}

function cleanDiagramSlug(slug: string) {
  const cleaned = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Diagram slug is required.");
  return cleaned;
}

export const uploadDiagramImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      slug: string;
      svgText: string;
      caption?: string;
      kind?: string;
      topicSlug?: string | null;
      capabilityId?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const slug = cleanDiagramSlug(data.slug);
    const svgText = assertSafeSvg(data.svgText);
    const sb = await adminClient();
    const objectName = `${slug}.svg`;
    const { error: uploadError } = await sb.storage.from("diagrams").upload(objectName, svgText, {
      contentType: "image/svg+xml",
      upsert: true,
    });
    if (uploadError) throw new Error(uploadError.message);
    const { data: publicData } = sb.storage.from("diagrams").getPublicUrl(objectName);
    const path = publicData.publicUrl;
    const { error } = await sb.from("diagrams").upsert(
      {
        slug,
        path,
        caption: data.caption ?? "",
        kind: data.kind ?? "architecture",
        topic_slug: data.topicSlug ?? null,
        capability_id: data.capabilityId ?? null,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "diagram.uploaded", "diagram", slug, {
      path,
      topic_slug: data.topicSlug ?? null,
      capability_id: data.capabilityId ?? null,
    });
    return { ok: true as const, slug, path };
  });

export const deleteDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const slug = cleanDiagramSlug(data.slug);
    const sb = await adminClient();
    await sb.storage.from("diagrams").remove([`${slug}.svg`]);
    const { error } = await sb.from("diagrams").delete().eq("slug", slug);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "diagram.deleted", "diagram", slug);
    return { ok: true as const };
  });

export const mutateClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { claimId: string; action: ClaimAction }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { mutateClaimStatus } = await adminServices();
    await mutateClaimStatus(sb, data.claimId, data.action);
    await recordAudit(context.userId, `claim.${data.action}`, "claim", data.claimId);
    return { ok: true };
  });

export const bulkVerifyClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { capabilityId?: string; topicSlug?: string; scope?: "all" }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (!data.capabilityId && !data.topicSlug && data.scope !== "all") {
      throw new Error("Provide a capability, a topic, or scope: 'all' to verify.");
    }
    const sb = await adminClient();
    const { bulkVerifyClaims: bulkVerifyClaimsRecord } = await adminServices();
    const result = await bulkVerifyClaimsRecord(sb, {
      capabilityId: data.capabilityId,
      topicSlug: data.topicSlug,
      scope: data.scope,
    });
    const targetType = data.scope === "all" ? "global" : data.topicSlug ? "topic" : "capability";
    const targetId = data.scope === "all" ? "all" : (data.topicSlug ?? data.capabilityId ?? "");
    await recordAudit(context.userId, "claims.bulk_verified", targetType, targetId, {
      verified: result.verified,
    });
    return { ok: true as const, ...result };
  });

export const supersedeClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
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

export const saveContentItemVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      kind: "article" | "design" | "lesson";
      existingId?: string;
      topic_slug?: string | null;
      capability_id?: string | null;
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
        .from("content_items")
        .select("*")
        .eq("id", data.existingId)
        .single();
      if (error) throw new Error(error.message);
      prior = existing;
    } else {
      const { data: existing } = await sb
        .from("content_items")
        .select("*")
        .eq("kind", data.kind)
        .eq("slug", data.slug)
        .eq("active", true)
        .maybeSingle();
      prior = existing;
    }

    const { saveContentItemVersion: saveContentItemVersionRecord } = await adminServices();
    const created = await saveContentItemVersionRecord(sb, {
      kind: data.kind,
      existingId: data.existingId,
      topic_slug: data.topic_slug ?? prior?.topic_slug,
      capability_id: data.capability_id ?? prior?.capability_id,
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? "",
      body_md: data.body_md,
      status: data.status ?? "published",
      cited_source_ids: data.cited_source_ids,
      tags: data.tags ?? [],
      depth_levels: data.depth_levels ?? [],
    });

    await recordAudit(
      context.userId,
      prior ? `${data.kind}.version_created` : `${data.kind}.created`,
      data.kind,
      created.id,
      {
        slug: data.slug,
        supersedes_id: prior?.id ?? null,
      },
    );
    return { ok: true, item: created };
  });

export const mutateQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string; action: QueueAction; sourceId?: string; error?: string }) => d)
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

export const bulkClaimQueueItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemIds: string[] }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const itemIds = [...new Set(data.itemIds)];
    if (!itemIds.length) throw new Error("Select at least one queued item.");
    if (itemIds.length > 100) throw new Error("You can claim up to 100 items at once.");

    const sb = await adminClient();
    const { mutateQueueItem: mutateQueueItemRecord } = await adminServices();
    for (const itemId of itemIds) {
      await mutateQueueItemRecord(sb, itemId, "claim");
      await recordAudit(context.userId, "queue.claim", "queue_item", itemId, { bulk: true });
    }
    return { ok: true as const, claimed: itemIds.length };
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
  diagrams: Array<Record<string, unknown>>;
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

export const getSuggestedActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { computeSuggestedActions } = await adminServices();
    return computeSuggestedActions(sb);
  });

export const commissionDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetSlug: string; title?: string; scheduledAt?: string }) => d)
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

export const commissionWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      kind: "diagram" | "article" | "design" | "lesson";
      targetSlug: string;
      title?: string;
      brief?: string;
      scheduledAt?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { commissionWork: commissionWorkRecord } = await adminServices();
    await commissionWorkRecord(sb, data);
    await recordAudit(context.userId, `${data.kind}.commissioned`, data.kind, data.targetSlug, {
      scheduled_at: data.scheduledAt,
    });
    return { ok: true as const };
  });

export const submitSourceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { sourceId: string; note?: string }) => d)
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

export const submitSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { url: string; title?: string; tier?: number; tags?: string[]; note?: string }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);

    const url = (data.url ?? "").trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Enter a valid URL (including https://).");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) URLs can be queued.");
    }

    const tier = data.tier ?? 6;
    if (tier < 1 || tier > 6) throw new Error("Tier must be between 1 and 6.");

    const sb = await adminClient();

    // Dedup: refuse if the URL is already an approved source or an open queue item.
    const { data: existingSource } = await sb
      .from("sources")
      .select("slug")
      .eq("url", url)
      .maybeSingle();
    if (existingSource) {
      throw new Error(`Already an approved source (${existingSource.slug}).`);
    }
    const { data: openItem } = await sb
      .from("queue_items")
      .select("id,status")
      .eq("url", url)
      .in("status", ["queued", "claimed"])
      .maybeSingle();
    if (openItem) {
      throw new Error("That URL is already in the ingestion queue.");
    }

    const note = data.note?.trim() ?? "";
    const { data: queued, error } = await sb
      .from("queue_items")
      .insert({
        url,
        title: data.title?.trim() ?? "",
        tier,
        tags: data.tags ?? [],
        kind: "source",
        notes: note,
        submitted_by: context.userId,
        status: "queued",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await recordAudit(context.userId, "source.url_submitted", "queue", queued.id, { url });
    return { ok: true as const, queue: queued };
  });

// --- RSS subscriptions -----------------------------------------------------
// Feeds are stored here; the local /poll-rss-feeds agent does the actual fetch/parse/queue.

export const listRssSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { data, error } = await sb
      .from("rss_subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { subscriptions: data ?? [] };
  });

export const addRssSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { feedUrl: string; title?: string; defaultTier?: number; defaultTags?: string[] }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);

    const feedUrl = (data.feedUrl ?? "").trim();
    let parsed: URL;
    try {
      parsed = new URL(feedUrl);
    } catch {
      throw new Error("Enter a valid feed URL (including https://).");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) feed URLs are supported.");
    }
    const tier = data.defaultTier ?? 6;
    if (tier < 1 || tier > 6) throw new Error("Tier must be between 1 and 6.");

    const sb = await adminClient();
    const { data: row, error } = await sb
      .from("rss_subscriptions")
      .insert({
        feed_url: feedUrl,
        title: data.title?.trim() ?? "",
        default_tier: tier,
        default_tags: data.defaultTags ?? [],
        status: "active",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("That feed is already subscribed.");
      }
      throw new Error(error.message);
    }
    await recordAudit(context.userId, "rss.subscribed", "rss_subscription", row.id, { feedUrl });
    return { ok: true as const, subscription: row };
  });

export const setRssSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "active" | "paused" }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (data.status !== "active" && data.status !== "paused") {
      throw new Error("Invalid status.");
    }
    const sb = await adminClient();
    const { error } = await sb
      .from("rss_subscriptions")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, `rss.${data.status}`, "rss_subscription", data.id);
    return { ok: true as const };
  });

export const deleteRssSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb.from("rss_subscriptions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "rss.unsubscribed", "rss_subscription", data.id);
    return { ok: true as const };
  });

// --- Unified source watchers ----------------------------------------------

type WatcherMode = "auto" | "rss" | "sitemap" | "listing" | "page";
type WatcherAttemptResult = {
  mode: WatcherMode;
  url: string;
  outcome: "success" | "empty" | "unchanged" | "error";
  candidates: number;
  error?: string;
};
type WatcherInput = {
  url: string;
  title?: string;
  mode?: WatcherMode;
  alternativeUrl?: string;
  allowedPathPrefix?: string;
  maxDepth?: number;
  maxPages?: number;
  defaultTier?: number;
  defaultTags?: string[];
};

function watcherValues(data: WatcherInput) {
  const parsed = new URL(data.url.trim());
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Only credential-free HTTP(S) URLs are supported.");
  }
  const maxDepth = data.maxDepth ?? 1;
  const maxPages = data.maxPages ?? 100;
  const tier = data.defaultTier ?? 6;
  if (maxDepth < 0 || maxDepth > 3 || maxPages < 1 || maxPages > 500 || tier < 1 || tier > 6)
    throw new Error("Watcher limits or tier are out of range.");
  if (data.alternativeUrl) new URL(data.alternativeUrl);
  return {
    url: parsed.toString(),
    title: data.title?.trim() ?? "",
    mode: "auto" as const,
    alternative_url: data.alternativeUrl?.trim() || null,
    allowed_host: parsed.hostname.toLowerCase(),
    allowed_path_prefix:
      data.allowedPathPrefix?.trim() || parsed.pathname.replace(/[^/]*$/, "") || "/",
    max_depth: maxDepth,
    max_pages: maxPages,
    default_tier: tier,
    default_tags: data.defaultTags ?? [],
  };
}

export const listSourceWatchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { data, error } = await sb
      .from("source_watchers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { watchers: data ?? [] };
  });

export const testSourceWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: WatcherInput) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const values = watcherValues(data);
    const { testWatcher } = await import("@/lib/source-watcher.server");
    try {
      const result = await testWatcher({
        ...values,
        last_success_at: null,
        etag: null,
        last_modified: null,
      });
      return { ok: true as const, ...result };
    } catch (e) {
      return {
        ok: false as const,
        error: (e as Error).message || "Watcher test failed.",
        code: (e as { code?: string }).code ?? "http",
        trigger: (e as { trigger?: string }).trigger,
        suggestedUrl: (e as { suggestedUrl?: string }).suggestedUrl,
        attempts: (e as { attempts?: WatcherAttemptResult[] }).attempts ?? [],
      };
    }
  });

export const addSourceWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: WatcherInput) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const values = watcherValues(data);
    const { testWatcher } = await import("@/lib/source-watcher.server");
    const validation = await testWatcher({
      ...values,
      detected_mode: null,
      detected_url: null,
      last_success_at: null,
      etag: null,
      last_modified: null,
    });
    const { data: row, error } = await sb
      .from("source_watchers")
      .insert({
        ...values,
        detected_mode: validation.mode,
        detected_url: validation.resolvedUrl,
        last_attempt_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error)
      throw new Error(error.code === "23505" ? "That URL is already watched." : error.message);
    await recordAudit(context.userId, "watcher.created", "source_watcher", row.id, {
      url: values.url,
      mode: values.mode,
      detectedMode: validation.mode,
      detectedUrl: validation.resolvedUrl,
    });
    return { ok: true as const, watcher: row };
  });

export const updateSourceWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: WatcherInput & { id: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const values = watcherValues(data);
    const { data: existing, error: readError } = await sb
      .from("source_watchers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (readError || !existing) throw new Error(readError?.message ?? "Watcher not found.");
    const discoveryChanged =
      existing.url !== values.url ||
      existing.alternative_url !== values.alternative_url ||
      existing.allowed_host !== values.allowed_host ||
      existing.allowed_path_prefix !== values.allowed_path_prefix ||
      existing.max_depth !== values.max_depth ||
      existing.max_pages !== values.max_pages;
    let retained = {
      detected_mode: existing.detected_mode,
      detected_url: existing.detected_url,
    };
    if (discoveryChanged) {
      const { testWatcher } = await import("@/lib/source-watcher.server");
      const validation = await testWatcher({
        ...values,
        detected_mode: null,
        detected_url: null,
        last_success_at: null,
        etag: null,
        last_modified: null,
      });
      retained = {
        detected_mode: validation.mode,
        detected_url: validation.resolvedUrl,
      };
    }
    const { error } = await sb
      .from("source_watchers")
      .update({
        ...values,
        ...retained,
        ...(discoveryChanged
          ? { etag: null, last_modified: null, last_attempt_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "watcher.updated", "source_watcher", data.id, {
      url: values.url,
      mode: values.mode,
    });
    return { ok: true as const };
  });

export const setSourceWatcherStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "active" | "paused" }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("source_watchers")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, `watcher.${data.status}`, "source_watcher", data.id);
    return { ok: true as const };
  });

export const deleteSourceWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb.from("source_watchers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "watcher.deleted", "source_watcher", data.id);
    return { ok: true as const };
  });

export const pollSourceWatchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { watcherId?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { pollSourceWatchersCore } = await import("@/lib/source-watcher.server");
    const result = await pollSourceWatchersCore(sb, {
      watcherId: data.watcherId,
      actorId: context.userId,
    });
    await recordAudit(context.userId, "watcher.polled", "source_watcher", data.watcherId ?? "all", {
      totalQueued: result.totalQueued,
      results: result.results,
    });
    return result;
  });

// --- RSS polling -----------------------------------------------------------
// Fetch each active feed, dedupe new entries against existing sources + the open
// queue, and enqueue them as kind=source items. Runs on the server (Lovable host)
// so it can use supabaseAdmin — local agents/scripts can't reach the sealed DB.
// This replaces the legacy /poll-rss-feeds agent that needed a local FastAPI + psql.

type RssEntry = { link: string; title: string; guid: string; published: string };

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1]) : "";
}

// Atom links are attributes (<link href="..."/>), RSS links are element text.
function entryLink(block: string): string {
  const text = tagText(block, "link");
  if (text) return text;
  const href = block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return href ? decodeXmlEntities(href[1]) : "";
}

// Repeated sibling <category> tags — tagText only grabs the first, roadmap items need all.
function tagTextAll(block: string, tag: string): string[] {
  const matches = block.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"));
  return [...matches].map((m) => decodeXmlEntities(m[1])).filter(Boolean);
}

function parseFeed(xml: string): RssEntry[] {
  const entries: RssEntry[] = [];
  // RSS <item> and Atom <entry>, in document order.
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const link = entryLink(block);
    const guid = tagText(block, "guid") || tagText(block, "id") || link;
    const title = tagText(block, "title");
    const published =
      tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated");
    if (link || guid) entries.push({ link: link || guid, title, guid: guid || link, published });
  }
  return entries;
}

const FIRST_POLL_CAP = 25;

export const pollRssFeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { feedId?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { pollRssFeedsCore } = await import("@/lib/rss-poll.server");
    const result = await pollRssFeedsCore(sb, { feedId: data.feedId, actorId: context.userId });
    const failed = result.results.filter((r) => r.error);
    await recordAudit(context.userId, "rss.polled", "rss_subscription", data.feedId ?? "all", {
      feeds: result.results.length,
      queued: result.totalQueued,
      failed: failed.length,
      results: result.results,
    });
    // Emit a distinct failed event per feed so exceptions (HTTP 403, timeouts, parse errors)
    // are visible in the Logs tab without expanding the aggregate rss.polled entry.
    for (const r of failed) {
      await recordAudit(
        context.userId,
        "rss.poll_failed",
        "rss_subscription",
        data.feedId ?? "all",
        { feed: r.feed, error: r.error, found: r.found, queued: r.queued, skipped: r.skipped },
      );
    }
    return result;
  });

// --- Fabric roadmap sync ----------------------------------------------------
// Syncs public.roadmap_items verbatim from the fixed Microsoft Fabric public roadmap feed.
// Unlike RSS blog subscriptions, this never routes through the claims/curator pipeline — the
// feed is already structured (status, release type, target date) and single-sourced, so we
// mirror it directly. Never paraphrased, never embellished: "never invent roadmap claims."

const FABRIC_ROADMAP_FEED_URL = "https://www.fabric-gps.com/rss";

const ROADMAP_STATUS_CATEGORIES: Record<string, string> = {
  planned: "planned",
  "rolling out": "rolling_out",
  launched: "launched",
};

function deriveRoadmapStatus(categories: string[]): string {
  for (const c of categories) {
    const mapped = ROADMAP_STATUS_CATEGORIES[c.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return "planned";
}

function deriveReleaseType(categories: string[]): string {
  return categories.find((c) => !(c.trim().toLowerCase() in ROADMAP_STATUS_CATEGORIES)) ?? "";
}

// Pulls "Planned General availability Date: Q4 2026" (or similar) out of the CDATA description.
function parseTargetRelease(descriptionHtml: string): string {
  const m = descriptionHtml.match(/Planned[^:<]*Date:<\/strong>\s*([^<]+)/i);
  return m ? m[1].trim() : "";
}

export const pollFabricRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { pollFabricRoadmapCore } = await import("@/lib/rss-poll.server");
    const result = await pollFabricRoadmapCore(sb);
    if (result.ok) {
      await recordAudit(context.userId, "roadmap.polled", "roadmap_sync_state", "", {
        found: result.found,
        created: result.created,
        updated: result.updated,
      });
    } else {
      await recordAudit(context.userId, "roadmap.poll_failed", "roadmap_sync_state", "", {
        error: result.error,
      });
    }
    return result;
  });

export const getRoadmapSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { data, error } = await sb
      .from("roadmap_sync_state")
      .select("last_polled_at,error_count,last_error")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { count } = await sb.from("roadmap_items").select("id", { count: "exact", head: true });
    return { status: data ?? null, itemCount: count ?? 0 };
  });

export const updateRoadmapItemCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; capabilityId?: string | null }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { error } = await sb
      .from("roadmap_items")
      .update({ capability_id: data.capabilityId || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit(context.userId, "roadmap.capability_updated", "roadmap_item", data.id, {
      capability_id: data.capabilityId || null,
    });
    return { ok: true as const };
  });

// Publish a single agent-authored content/*.json payload (pasted by an admin in Settings) into
// the KB. Laptop agents write files keylessly; this server-side step (service role) persists them.
export const publishFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      kind: "source" | "blog" | "article" | "design" | "lesson" | "diagram";
      payload: unknown;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (!["source", "blog", "article", "design", "lesson", "diagram"].includes(data.kind)) {
      throw new Error("kind must be source, article, design, lesson, or diagram.");
    }
    if (!data.payload || typeof data.payload !== "object") {
      throw new Error("payload must be the parsed content JSON (object or array).");
    }
    const sb = await adminClient();
    const { publishFromFile: publishFromFileRecord } =
      await import("@/lib/atlas-publish.services.server");
    const result = await publishFromFileRecord(sb, data.kind, data.payload);
    await recordAudit(
      context.userId,
      `${data.kind}.published_from_file`,
      data.kind,
      (result as { slug?: string }).slug ?? "",
    );
    return { ok: true as const, result };
  });

// Publish every content/sources, content/articles, content/designs, content/lessons, and
// content/diagrams file bundled into this deploy, in dependency order
// (sources -> diagrams -> articles/designs/lessons), via the same versioned publishFromFile path
// used above. Skips anything unchanged since the last publish unless force=true.
export const publishAllBundled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { force?: boolean } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { publishAllBundled: publishAllBundledRecord } =
      await import("@/lib/atlas-publish-all.server");
    const summary = await publishAllBundledRecord(sb, { force: data.force });
    await recordAudit(context.userId, "content.published_all", "content", "", {
      published: summary.published,
      skipped: summary.skipped,
      blocked: summary.blocked,
      failed: summary.failed,
    });
    return { ok: true as const, summary };
  });

export const validateContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { kind: "article" | "design" | "lesson"; id: string }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
    const sb = await adminClient();
    const { validateContent: validateContentRecord } = await adminServices();
    const result = (await validateContentRecord(sb, data)) as JsonValue;
    await recordAudit(context.userId, `${data.kind}.validation_run`, data.kind, data.id);
    return { ok: true as const, result };
  });
