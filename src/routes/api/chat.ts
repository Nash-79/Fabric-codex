import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { resolveActiveAiProvider, resolveModelForProvider } from "@/lib/ai-gateway.server";
import { DEFAULT_ADVISOR_MODEL } from "@/lib/advisor-models";
import type { AdvisorMessage } from "@/lib/advisor-types";
import { trySoftAuth } from "@/lib/soft-auth.server";
import type { Json } from "@/integrations/supabase/types";
import {
  checkRateLimit,
  requestKeyFromHeaders,
  resolveAllowedModel,
  validateMessagePayload,
} from "@/lib/chat-rate-limit.server";

async function recordChatRejection(reason: string, metadata: Record<string, unknown>) {
  // Best-effort: a logging failure must never mask the real rejection response.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_events").insert({
      actor_id: null,
      action: "chat.request_rejected",
      target_type: "api_chat",
      target_id: reason,
      metadata: metadata as Json,
    });
  } catch {
    // Swallow — diagnostic only.
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: AdvisorMessage[]; model?: string };
        const messages = body.messages ?? [];
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }
        const activeAi = await resolveActiveAiProvider();
        if (!activeAi) {
          return new Response(
            "AI provider not configured. Please configure OpenRouter or Lovable in Settings → API Keys.",
            { status: 500 },
          );
        }

        const payloadCheck = validateMessagePayload(messages);
        if (!payloadCheck.ok) {
          return new Response(payloadCheck.error, { status: 400 });
        }

        const auth = await trySoftAuth(request);
        const rateLimitKey = requestKeyFromHeaders(request.headers, auth?.userId ?? null);
        const rateLimit = checkRateLimit(rateLimitKey);
        if (!rateLimit.allowed) {
          await recordChatRejection("rate_limited", { key: rateLimitKey });
          return new Response("Too many requests — please slow down.", {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((rateLimit.retryAfterMs ?? 0) / 1000)) },
          });
        }

        const requestedModel = typeof body.model === "string" ? body.model : "";
        const allowedModelId = resolveAllowedModel(
          requestedModel,
          DEFAULT_ADVISOR_MODEL,
          auth !== null,
          auth?.approved ?? false,
        );
        if (requestedModel && requestedModel !== allowedModelId) {
          await recordChatRejection("model_tier_downgraded", {
            requested: requestedModel,
            resolved: allowedModelId,
            authenticated: auth !== null,
          });
        }

        const modelId = resolveModelForProvider(allowedModelId, activeAi);

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const userText =
          lastUser?.parts
            .map((p: any) => (p.type === "text" ? p.text : ""))
            .join(" ")
            .trim() ?? "";

        const { advisorRetrieveContext, advisorContextToPrompt } =
          await import("@/lib/advisor-context.server");
        const retrieval = await advisorRetrieveContext(userText);
        const contextBlock = advisorContextToPrompt(retrieval);

        const system = `You are the Fabric Atlas Advisor — an expert on Microsoft Fabric grounded ONLY in the approved Fabric Atlas knowledge base. The CONTEXT below is retrieved from verified claims, blogs/articles, solution architectures, lessons, sources, topics, capabilities, and diagrams.

Rules (non-negotiable):
- Cite every factual statement inline with [C1], [C2], etc. matching the claim numbers in CONTEXT.
- Use related blogs, architectures, lessons, topics, capabilities, and diagrams to guide structure, navigation, and "what to read next", but do not make uncited factual claims from them unless a verified [C#] claim supports the fact.
- When useful, point readers to related Atlas content as [R#], topics as [T#], capabilities as [K#], and diagrams as [D#].
- If VERIFIED CLAIMS is empty or insufficient to answer, say: "The Fabric Atlas is silent on this — no approved claims cover it yet." Then suggest 1–2 capabilities, topics, or source types worth ingesting next. Do not invent the answer.
- Distinguish verified fact from your own reasoning: prefix inferences with "_Inference:_ ".
- Never invent Microsoft Fabric product limits, quotas, pricing, SKUs, or roadmap.
- Prefer higher-tier sources (T1/T2) when claims conflict, and call out the conflict.
- Write in an inclusive way: do not assume the reader's role or seniority, expand acronyms on first use, and offer beginner / practitioner / architect / internals framing when helpful.
- Output structure:
  1. Start with a short direct answer.
  2. Add a grounded explanation with citations.
  3. Include code, SQL, CLI, JSON, or config examples only when useful; format them as fenced code blocks with a language.
  4. Add caveats, assumptions, and "what to check next" when there are gaps.
  5. End with "Sources" mapping [C#] to source titles and, when useful, "Related Atlas links" for [R#]/[T#]/[K#]/[D#].
- Use polished markdown: concise headings, bullets, tables for comparisons, and readable code. Avoid filler.

CONTEXT (retrieved from the Fabric Atlas knowledge base):
${contextBlock}`;

        const model = activeAi.provider(modelId);

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return {
                createdAt: Date.now(),
                model: modelId,
                retrievalStatus: retrieval.claims.length ? "retrieved" : "empty",
                contextSummary: retrieval.summary,
                sources: retrieval.uiSources,
              };
            }
            if (part.type === "finish") {
              return {
                totalTokens: part.totalUsage?.totalTokens,
              };
            }
          },
        });
      },
    },
  },
});
