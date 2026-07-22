import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type IdeaSignalType = "roadmap" | "coverage" | "backlog" | "staleness";
type IdeaContentKind = "article" | "lesson" | "both";
type QueueAction = "claim" | "complete" | "fail" | "requeue" | "dismiss";
type PriorIdeaContext = {
  title: string;
  angle: string;
  signal_type: string;
  status: "dismissed" | "kept";
};

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

// Ideas are queue_items(kind='idea') rows — same table/RLS/queue_public surface every other
// local agent and Settings panel already reads, no new schema. Generation runs server-side via
// the Lovable AI Gateway (bundled Lovable credits, same provider the /advisor/chat route uses),
// not the metered Anthropic API; article authoring itself stays on the free local-agent path.
export const generateArticleIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d:
        | {
            signalTypes?: IdeaSignalType[];
            modelId?: string;
            userPrompt?: string;
            contentKind?: IdeaContentKind;
            priorIdeas?: PriorIdeaContext[];
          }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { generateIdeaCandidates, insertIdeaQueueItems } =
      await import("@/lib/article-ideas.services.server");
    const result = await generateIdeaCandidates(sb, {
      signalTypes: data.signalTypes,
      modelId: data.modelId,
      userPrompt: data.userPrompt,
      contentKind: data.contentKind,
      priorIdeas: data.priorIdeas,
    });
    const inserted = await insertIdeaQueueItems(sb, result.ideas, context.userId);
    await recordAudit(context.userId, "idea.generated", "queue_item", "", {
      count: inserted.length,
      signal_types: data.signalTypes ?? ["roadmap", "coverage", "backlog", "staleness"],
      requested_model_id: result.requestedModelId,
      used_model_id: result.usedModelId,
      fallback_used: result.usedModelId !== result.requestedModelId,
      user_prompt: data.userPrompt ?? null,
      content_kind: data.contentKind ?? "both",
    });
    return {
      ok: true as const,
      ideas: inserted,
      usedModelId: result.usedModelId,
      requestedModelId: result.requestedModelId,
      fallbackUsed: result.usedModelId !== result.requestedModelId,
    };
  });

// Idea lifecycle reuses the exact same queue_items status vocabulary/transitions as every
// other queue kind (mutateQueueItem in settings.functions.ts): "claim" = approved and in
// progress, "dismiss" = rejected, "complete" = the resulting article has been authored and
// published. This function exists only so the Article Ideas panel doesn't need to import
// settings.functions.ts's private QueueAction type — the underlying transition table is
// identical, delegated to the same atlas-admin.services.server helper.
export const setArticleIdeaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string; action: QueueAction }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();
    const { mutateQueueItem } = await import("@/lib/atlas-admin.services.server");
    await mutateQueueItem(sb, data.itemId, data.action);
    await recordAudit(context.userId, `idea.${data.action}`, "queue_item", data.itemId);
    return { ok: true as const };
  });

// Amend the brief of an idea that has NOT been authored yet. The brief lives JSON-encoded in
// queue_items.notes; approving an idea only flips its status to 'claimed' and never touches the
// brief, so before this there was no way to sharpen an approved idea's angle/rationale/length/
// diagram guidance before running /blog. Only 'queued' (not yet approved) and 'claimed' (approved,
// not yet authored) ideas are editable — once the article is authored ('ingested') or the idea is
// 'dismissed', the brief is frozen. Edited fields are merged over the existing notes JSON so
// signal fields the UI does not expose (supporting_capability_ids/roadmap_ids, signal_type,
// must_include_example, priority) are preserved untouched.
type IdeaBriefPatch = {
  title?: string;
  target_slug?: string;
  angle?: string;
  rationale?: string;
  target_length_hint?: string;
  diagram_guidance?: string;
  capability_level?: string | null;
};

export const updateArticleIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string; patch: IdeaBriefPatch }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const sb = await adminClient();

    const { data: item, error } = await sb
      .from("queue_items")
      .select("id,kind,status,title,target_slug,notes")
      .eq("id", data.itemId)
      .single();
    if (error || !item) throw new Error(error?.message ?? "Idea not found.");
    if (item.kind !== "idea") throw new Error("Not an article idea.");
    // Amendable in every pre-authoring state: queued (not yet approved), claimed (approved), and
    // failed (a /blog run that errored but produced no article). Once authored ('ingested') the
    // brief is frozen; a 'dismissed' idea must be revived (requeue → queued) before it can be
    // amended, so the reviver sees it back in the active list first.
    if (!["queued", "claimed", "failed"].includes(item.status)) {
      throw new Error(
        `Idea is '${item.status}'; only unauthored ideas (queued, claimed, or failed) can be ` +
          "amended. Revive a dismissed idea first.",
      );
    }

    let notes: Record<string, unknown> = {};
    if (typeof item.notes === "string" && item.notes.trim()) {
      try {
        notes = JSON.parse(item.notes);
      } catch {
        notes = {};
      }
    }

    const p = data.patch;
    // Merge only the fields the admin actually edited; leave every other note field intact.
    if (p.angle !== undefined) notes.angle = p.angle;
    if (p.rationale !== undefined) notes.rationale = p.rationale;
    if (p.target_length_hint !== undefined) notes.target_length_hint = p.target_length_hint;
    if (p.diagram_guidance !== undefined) notes.diagram_guidance = p.diagram_guidance;
    if (p.capability_level !== undefined) notes.capability_level = p.capability_level;

    const row: Record<string, unknown> = { notes: JSON.stringify(notes) };
    if (p.title !== undefined && p.title.trim()) row.title = p.title.trim();
    if (p.target_slug !== undefined && p.target_slug.trim()) {
      const slug = p.target_slug.trim();
      row.target_slug = slug;
      // url mirrors target_slug in insertIdeaQueueItems; keep them consistent on rename.
      row.url = `fabric-atlas://idea/${slug}`;
    }

    const { data: updated, error: updateError } = await sb
      .from("queue_items")
      .update(row)
      .eq("id", data.itemId)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error(updateError?.message ?? "Idea update failed.");

    await recordAudit(context.userId, "idea.amended", "queue_item", data.itemId, {
      fields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined),
    });
    return { ok: true as const, idea: updated };
  });
