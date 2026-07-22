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
