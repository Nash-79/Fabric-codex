import type { Database } from "@/integrations/supabase/types";

type SupabaseAdmin = any;
type ClaimAction = "verify" | "reject" | "promote" | "dismiss";
type QueueAction = "claim" | "complete" | "fail" | "requeue" | "dismiss";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlug(slug: string) {
  return slug.replace(/@v\d+$/, "");
}

async function insertClaimEvent(sb: SupabaseAdmin, claim: any, prevStatus: string, action: string) {
  await sb.from("claimevents").insert({
    claim_id: claim.id,
    action,
    prev_status: prevStatus,
    new_status: claim.status,
    capability_id: claim.capability_id,
    text_snippet: (claim.text ?? "").slice(0, 240),
  });
}

export async function mutateClaimStatus(sb: SupabaseAdmin, claimId: string, action: ClaimAction) {
  const { data: claim, error } = await sb.from("claims").select("*").eq("id", claimId).single();
  if (error || !claim) throw new Error(error?.message ?? "Claim not found.");

  const prevStatus = claim.status;
  let patch: Database["public"]["Tables"]["claims"]["Update"];
  if (action === "verify") {
    if (!claim.active) throw new Error("Only active claims can be verified.");
    patch = { status: "verified" };
  } else if (action === "reject") {
    patch = { status: "rejected", active: false };
  } else if (action === "promote") {
    patch = { status: "pending", active: true };
  } else {
    patch = { status: "dismissed", active: false };
  }

  const { data: updated, error: updateError } = await sb
    .from("claims")
    .update(patch)
    .eq("id", claimId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message ?? "Claim update failed.");
  await insertClaimEvent(sb, updated, prevStatus, action);
  return updated;
}

// Verify every active, pending claim for a capability or a topic in one human-triggered action.
// The replay path is dead (the old SQLite is empty), so curation status is restored by re-review;
// this just makes "review a topic, accept the good ones" a single click instead of N. It only ever
// touches active+pending claims — already-verified/rejected/superseded claims are left untouched.
export async function bulkVerifyClaims(
  sb: SupabaseAdmin,
  target: { capabilityId?: string; topicSlug?: string; scope?: "all" },
) {
  let capabilityIds: string[] | null = null;
  if (target.scope === "all") {
    capabilityIds = null; // signal: no capability filter, verify globally
  } else if (target.capabilityId) {
    capabilityIds = [target.capabilityId];
  } else if (target.topicSlug) {
    const { data: links, error } = await sb
      .from("topic_capabilities")
      .select("capability_id")
      .eq("topic_slug", target.topicSlug);
    if (error) throw new Error(error.message);
    const ids = (links ?? []).map((l: any) => l.capability_id);
    if (!ids.length) {
      return { verified: 0, capabilities: 0, message: "No capabilities mapped to this topic." };
    }
    capabilityIds = ids;
  } else {
    throw new Error("Provide a capabilityId, topicSlug, or scope: 'all'.");
  }

  let query = sb.from("claims").select("id").eq("status", "pending").eq("active", true);
  if (capabilityIds) query = query.in("capability_id", capabilityIds);
  const { data: pending, error: claimsError } = await query;
  if (claimsError) throw new Error(claimsError.message);

  let verified = 0;
  for (const claim of pending ?? []) {
    await mutateClaimStatus(sb, claim.id, "verify");
    verified++;
  }
  return { verified, capabilities: capabilityIds?.length ?? 0 };
}

export async function supersedeClaim(
  sb: SupabaseAdmin,
  claimId: string,
  data: { text: string; depth?: number; type?: string; tags?: string[] },
) {
  const text = data.text.trim();
  if (!text) throw new Error("Claim text is required.");

  const { data: prior, error } = await sb.from("claims").select("*").eq("id", claimId).single();
  if (error || !prior) throw new Error(error?.message ?? "Claim not found.");
  if (!prior.active) throw new Error("Only active claims can be superseded.");

  const { error: oldError } = await sb
    .from("claims")
    .update({ status: "superseded", active: false })
    .eq("id", claimId);
  if (oldError) throw new Error(oldError.message);

  const { data: created, error: insertError } = await sb
    .from("claims")
    .insert({
      source_id: prior.source_id,
      capability_id: prior.capability_id,
      text,
      depth: data.depth ?? prior.depth,
      type: data.type ?? prior.type,
      tags: data.tags ?? prior.tags ?? [],
      version: (prior.version ?? 1) + 1,
      supersedes_id: prior.id,
      active: true,
      status: "pending",
      confidence: prior.confidence ?? 0.5,
    })
    .select("*")
    .single();
  if (insertError || !created) throw new Error(insertError?.message ?? "Claim supersede failed.");

  await insertClaimEvent(sb, { ...prior, status: "superseded" }, prior.status, "supersede_old");
  await insertClaimEvent(sb, created, "", "supersede_new");
  return created;
}

export async function saveContentItemVersion(
  sb: SupabaseAdmin,
  data: {
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
  },
) {
  if (!data.title.trim() || !data.body_md.trim()) throw new Error("Title and body are required.");
  if (!data.cited_source_ids?.length) throw new Error("At least one cited source is required.");

  const baseSlug = normalizeSlug(data.slug.trim());
  let prior: any = null;
  if (data.existingId) {
    const { data: row, error } = await sb
      .from("content_items")
      .select("*")
      .eq("id", data.existingId)
      .single();
    if (error) throw new Error(error.message);
    prior = row;
  } else {
    const { data: row } = await sb
      .from("content_items")
      .select("*")
      .eq("kind", data.kind)
      .eq("slug", baseSlug)
      .eq("active", true)
      .maybeSingle();
    prior = row;
  }

  if (prior?.id) {
    const archivedSlug = `${baseSlug}@v${prior.version ?? 1}`;
    const { error } = await sb
      .from("content_items")
      .update({ active: false, status: "superseded", slug: archivedSlug })
      .eq("id", prior.id);
    if (error) throw new Error(error.message);
  }

  const { data: created, error: createError } = await sb
    .from("content_items")
    .insert({
      kind: data.kind,
      topic_slug: data.topic_slug ?? prior?.topic_slug ?? null,
      capability_id: data.capability_id ?? prior?.capability_id ?? null,
      slug: baseSlug,
      title: data.title,
      summary: data.summary ?? "",
      body_md: data.body_md,
      status: data.status ?? "published",
      tags: data.tags ?? [],
      depth_levels: data.depth_levels ?? [],
      version: prior ? (prior.version ?? 1) + 1 : 1,
      supersedes_id: prior?.id ?? null,
      active: true,
      ready_to_share: false,
      validation_confidence: null,
      document: {
        slug: baseSlug,
        title: data.title,
        summary: data.summary ?? "",
        body_md: data.body_md,
        cited_source_ids: data.cited_source_ids,
      },
    })
    .select("*")
    .single();
  if (createError || !created) throw new Error(createError?.message ?? `${data.kind} save failed.`);

  const rows = data.cited_source_ids.map((sourceId, index) => ({
    content_item_id: created.id,
    source_id: sourceId,
    label: `S${index + 1}`,
    position: index,
  }));
  const { error: citeError } = await sb.from("content_item_sources").insert(rows);
  if (citeError) throw new Error(citeError.message);
  return created;
}

export async function mutateQueueItem(
  sb: SupabaseAdmin,
  itemId: string,
  action: QueueAction,
  data: { sourceId?: string; error?: string } = {},
) {
  const { data: item, error } = await sb.from("queue_items").select("*").eq("id", itemId).single();
  if (error || !item) throw new Error(error?.message ?? "Queue item not found.");

  const transition: Record<QueueAction, { from: string[]; patch: Record<string, unknown> }> = {
    claim: { from: ["queued"], patch: { status: "claimed", claimed_at: nowIso(), error: "" } },
    complete: {
      from: ["claimed", "queued"],
      patch: { status: "ingested", result_source_id: data.sourceId ?? null, error: "" },
    },
    fail: { from: ["claimed", "queued"], patch: { status: "failed", error: data.error ?? "" } },
    requeue: {
      from: ["failed", "claimed"],
      patch: { status: "queued", claimed_at: null, error: "" },
    },
    dismiss: { from: ["queued", "failed"], patch: { status: "dismissed" } },
  };
  const selected = transition[action];
  if (!selected.from.includes(item.status)) {
    throw new Error(`Queue item is '${item.status}'; expected one of ${selected.from.join(", ")}.`);
  }
  if (action === "complete" && (item.kind ?? "source") === "source" && !data.sourceId) {
    throw new Error("A source id is required to complete source queue items.");
  }

  const { data: updated, error: updateError } = await sb
    .from("queue_items")
    .update(selected.patch)
    .eq("id", itemId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message ?? "Queue update failed.");
  return updated;
}

export async function getDiagramCoverage(sb: SupabaseAdmin) {
  const [{ data: topics }, { data: diagrams }, { data: queue }] = await Promise.all([
    sb
      .from("topics")
      .select("slug,name,active")
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    sb.from("diagrams").select("slug,topic_slug,path,caption,kind,capability_id"),
    sb
      .from("queue_items")
      .select("*")
      .eq("kind", "diagram")
      .in("status", ["queued", "claimed"])
      .order("created_at", { ascending: false }),
  ]);

  const diagramCounts = new Map<string, number>();
  for (const d of diagrams ?? []) {
    const key = d.topic_slug || d.slug;
    if (!key) continue;
    diagramCounts.set(key, (diagramCounts.get(key) ?? 0) + 1);
  }
  const open = new Set((queue ?? []).map((q: any) => q.target_slug).filter(Boolean));
  const coverage = (topics ?? []).map((topic: any) => {
    const diagram_count = diagramCounts.get(topic.slug) ?? 0;
    return {
      slug: topic.slug,
      name: topic.name,
      diagram_count,
      has_diagram: diagram_count > 0,
      commission_open: open.has(topic.slug),
    };
  });
  return { coverage, pending: queue ?? [], diagrams: diagrams ?? [] };
}

export async function commissionDiagram(
  sb: SupabaseAdmin,
  data: { targetSlug: string; title?: string; scheduledAt?: string },
) {
  const targetSlug = data.targetSlug.trim();
  if (!targetSlug) throw new Error("Target slug is required.");
  const { data: existing } = await sb
    .from("queue_items")
    .select("id")
    .eq("kind", "diagram")
    .eq("target_slug", targetSlug)
    .in("status", ["queued", "claimed"])
    .maybeSingle();
  if (existing) throw new Error(`A diagram is already commissioned for '${targetSlug}'.`);

  const { data: item, error } = await sb
    .from("queue_items")
    .insert({
      kind: "diagram",
      target_slug: targetSlug,
      title: data.title ?? `${targetSlug} diagram`,
      url: `fabric-atlas://diagram/${targetSlug}`,
      status: "queued",
      scheduled_at: data.scheduledAt || null,
      notes: "Commissioned from Lovable Settings.",
    })
    .select("*")
    .single();
  if (error || !item) throw new Error(error?.message ?? "Diagram commission failed.");
  return item;
}

export async function commissionWork(
  sb: SupabaseAdmin,
  data: {
    kind: "diagram" | "article" | "design" | "lesson";
    targetSlug: string;
    title?: string;
    brief?: string;
    scheduledAt?: string;
  },
) {
  const targetSlug = data.targetSlug.trim();
  if (!targetSlug) throw new Error("Target slug is required.");
  const { data: existing } = await sb
    .from("queue_items")
    .select("id")
    .eq("kind", data.kind)
    .eq("target_slug", targetSlug)
    .in("status", ["queued", "claimed"])
    .maybeSingle();
  if (existing) throw new Error(`${data.kind} work is already commissioned for '${targetSlug}'.`);

  const { data: item, error } = await sb
    .from("queue_items")
    .insert({
      kind: data.kind,
      target_slug: targetSlug,
      title: data.title ?? `${targetSlug} ${data.kind}`,
      url: `fabric-atlas://${data.kind}/${targetSlug}`,
      status: "queued",
      scheduled_at: data.scheduledAt || null,
      notes: data.brief || `Commissioned ${data.kind} from Settings.`,
    })
    .select("*")
    .single();
  if (error || !item) throw new Error(error?.message ?? `${data.kind} commission failed.`);
  return item;
}

export async function computeSuggestedActions(sb: SupabaseAdmin) {
  const now = new Date().toISOString();
  const [
    { data: queue },
    { data: rss },
    { data: topics },
    { data: contentItems },
    { data: claims },
    { data: validationIssues },
    { data: diagrams },
  ] = await Promise.all([
    sb
      .from("queue_items")
      .select("id,kind,title,url,target_slug,status,scheduled_at,created_at,error")
      .in("status", ["queued", "claimed", "failed"])
      .order("created_at", { ascending: true }),
    sb
      .from("rss_subscriptions")
      .select("id,title,feed_url,status,last_polled_at,error_count,last_error")
      .order("created_at", { ascending: true }),
    sb.from("topics").select("slug,name,active").eq("active", true),
    sb
      .from("content_items")
      .select("id,kind,slug,title,topic_slug,body_md,active,status,ready_to_share")
      .eq("active", true),
    sb
      .from("claims")
      .select("id,capability_id,status,active")
      .eq("status", "pending")
      .eq("active", true),
    sb
      .from("issues")
      .select("id,severity,message,created_at")
      .eq("severity", "critical")
      .order("created_at", { ascending: false })
      .limit(20),
    sb.from("diagrams").select("slug,path,topic_slug,capability_id"),
  ]);

  const actions: Array<{
    id: string;
    priority: number;
    label: string;
    detail: string;
    tab: string;
    command?: string;
  }> = [];

  const dueQueue = (queue ?? []).filter(
    (q: any) =>
      ["queued", "claimed"].includes(q.status) &&
      (!q.scheduled_at || new Date(q.scheduled_at).toISOString() <= now),
  );
  const failedQueue = (queue ?? []).filter((q: any) => q.status === "failed");
  const sourceQueue = dueQueue.filter((q: any) => q.kind === "source");
  const commissionQueue = dueQueue.filter((q: any) => q.kind !== "source");
  if (sourceQueue.length) {
    actions.push({
      id: "queued-sources",
      priority: 100,
      label: `${sourceQueue.length} source(s) ready for ingestion`,
      detail: sourceQueue[0].title || sourceQueue[0].url,
      tab: "queue",
      command: "/ingest-batch",
    });
  }
  if (commissionQueue.length) {
    const first = commissionQueue[0];
    const kind = first.kind === "diagram" ? "diagram" : first.kind;
    actions.push({
      id: "due-commissions",
      priority: 95,
      label: `${commissionQueue.length} commissioned work item(s) due`,
      detail: first.target_slug || first.title || kind,
      tab: first.kind === "diagram" ? "diagrams" : "blogs",
      command:
        first.kind === "diagram"
          ? "/commission-diagrams"
          : `/${kind} ${first.target_slug ?? ""}`.trim(),
    });
  }
  if (failedQueue.length) {
    actions.push({
      id: "failed-queue",
      priority: 90,
      label: `${failedQueue.length} failed queue item(s)`,
      detail: failedQueue[0].error || failedQueue[0].title || "Review failure reason",
      tab: "queue",
    });
  }

  const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const staleFeeds = (rss ?? []).filter(
    (r: any) =>
      r.status === "active" &&
      (!r.last_polled_at || new Date(r.last_polled_at).getTime() < staleCutoff),
  );
  const failingFeeds = (rss ?? []).filter((r: any) => (r.error_count ?? 0) > 0);
  if (staleFeeds.length || failingFeeds.length) {
    actions.push({
      id: "rss-attention",
      priority: 80,
      label: `${staleFeeds.length} stale / ${failingFeeds.length} failing feed(s)`,
      detail: failingFeeds[0]?.last_error || staleFeeds[0]?.title || staleFeeds[0]?.feed_url || "",
      tab: "rss",
      command: "/poll-rss-feeds",
    });
  }

  if ((claims ?? []).length) {
    actions.push({
      id: "pending-claims",
      priority: 75,
      label: `${claims.length} pending claim(s) need verification`,
      detail: "Verify, reject, or supersede before content generation.",
      tab: "claims",
      command: "/orchestrate-content",
    });
  }

  const articleTopics = new Set(
    (contentItems ?? [])
      .filter((i: any) => i.kind === "article" && i.status === "published" && i.topic_slug)
      .map((i: any) => i.topic_slug),
  );
  const articleLess = (topics ?? []).filter((t: any) => !articleTopics.has(t.slug));
  if (articleLess.length) {
    actions.push({
      id: "article-less-topics",
      priority: 60,
      label: `${articleLess.length} topic(s) have no published article`,
      detail: articleLess[0].name,
      tab: "blogs",
      command: `/blog ${articleLess[0].slug}`,
    });
  }

  const internalsPlaceholders = (contentItems ?? []).filter((i: any) =>
    /\*Coming soon[\s\S]*content\/queue\.md/i.test(i.body_md ?? ""),
  );
  if (internalsPlaceholders.length) {
    actions.push({
      id: "internals-placeholders",
      priority: 55,
      label: `${internalsPlaceholders.length} article/design internals placeholder(s)`,
      detail: internalsPlaceholders[0].title,
      tab: "blogs",
      command: "/orchestrate-content",
    });
  }

  if ((validationIssues ?? []).length) {
    actions.push({
      id: "validation-critical",
      priority: 85,
      label: `${validationIssues.length} critical validation issue(s)`,
      detail: validationIssues[0].message,
      tab: "logs",
    });
  }

  const storageOverrides = (diagrams ?? []).filter((d: any) => /^https?:\/\//i.test(d.path ?? ""));
  if (storageOverrides.length) {
    actions.push({
      id: "diagram-storage-overrides",
      priority: 50,
      label: `${storageOverrides.length} diagram storage override(s) need git backport`,
      detail: storageOverrides[0].slug,
      tab: "diagrams",
    });
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 12);
}

function markdownLinks(body: string) {
  return [...body.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);
}

export async function validateContent(
  sb: SupabaseAdmin,
  data: { kind: "article" | "design" | "lesson"; id: string },
) {
  const { data: doc, error } = await sb
    .from("content_items")
    .select("*")
    .eq("id", data.id)
    .eq("kind", data.kind)
    .single();
  if (error || !doc) throw new Error(error?.message ?? `${data.kind} not found.`);

  const issues: Array<{ severity: string; message: string; validator: string; ref: string }> = [];
  const { data: citations } = await sb
    .from("content_item_sources")
    .select("source_id")
    .eq("content_item_id", data.id);
  if (!(citations ?? []).length) {
    issues.push({
      severity: "critical",
      message: "Document has no cited sources.",
      validator: "deterministic",
      ref: "citations",
    });
  }
  for (const path of markdownLinks(doc.body_md ?? "")) {
    if (path.startsWith("/content/diagrams/") || path.startsWith("/diagrams/")) {
      const slug = path
        .split("/")
        .pop()!
        .replace(/\.(svg|mmd)$/i, "");
      const { data: diagram } = await sb
        .from("diagrams")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!diagram) {
        issues.push({
          severity: "critical",
          message: `Embedded diagram is not registered: ${path}`,
          validator: "deterministic",
          ref: path,
        });
      }
    }
  }

  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const confidence = critical ? 0.35 : issues.length ? 0.75 : 0.95;
  const { data: run, error: runError } = await sb
    .from("validation_runs")
    .insert({
      design_id: data.kind === "design" ? data.id : null,
      target_kind: data.kind,
      target_id: data.id,
      confidence,
      score: Math.round(confidence * 100),
    })
    .select("*")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Validation run failed.");

  if (issues.length) {
    const { error: issueError } = await sb.from("issues").insert(
      issues.map((issue) => ({
        validation_run_id: run.id,
        severity: issue.severity,
        message: issue.message,
        validator: issue.validator,
        ref: issue.ref,
      })),
    );
    if (issueError) throw new Error(issueError.message);
  }

  const { error: updateError } = await sb
    .from("content_items")
    .update({ validation_confidence: confidence, confidence, ready_to_share: critical === 0 })
    .eq("id", data.id);
  if (updateError) throw new Error(updateError.message);

  return { run, issues, confidence, ready_to_share: critical === 0 };
}
