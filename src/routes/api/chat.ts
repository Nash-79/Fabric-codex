import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { ADVISOR_MODEL_IDS, DEFAULT_ADVISOR_MODEL } from "@/lib/advisor-models";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: UIMessage[]; model?: string };
        const messages = body.messages ?? [];
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY not configured", { status: 500 });

        const requestedModel = typeof body.model === "string" ? body.model : "";
        const modelId = ADVISOR_MODEL_IDS.has(requestedModel)
          ? requestedModel
          : DEFAULT_ADVISOR_MODEL;

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const userText =
          lastUser?.parts
            .map((p: any) => (p.type === "text" ? p.text : ""))
            .join(" ")
            .trim() ?? "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const words = userText
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 6);
        const ors = words.map((w) => `text.ilike.%${w}%`).join(",");
        const { data: claims } = ors
          ? await supabaseAdmin
              .from("claims")
              .select("id,text,depth,capability_id,sources(slug,title,url,tier)")
              .eq("active", true)
              .or(ors)
              .limit(12)
          : { data: [] as any[] };

        const contextBlock =
          (claims ?? []).length === 0
            ? "(no matching claims found in the atlas)"
            : (claims ?? [])
                .map(
                  (c: any, i: number) =>
                    `[C${i + 1}] (capability=${c.capability_id}, depth=L${c.depth}, tier=T${c.sources?.tier ?? 6}) ${c.text}\n    source: ${c.sources?.title} — ${c.sources?.url}`,
                )
                .join("\n\n");

        const system = `You are the Fabric Atlas Advisor. Answer ONLY using the cited claims provided in the CONTEXT.

Rules (non-negotiable):
- Cite every factual statement with [C1], [C2], etc.
- If CONTEXT is empty or insufficient, reply: "The Fabric Atlas is silent on this — no approved claims cover it yet." Do not invent.
- Distinguish verified fact from inference; prefix inferences with "_Inference:_ ".
- Never invent Microsoft Fabric product limits, quotas, pricing, or roadmap.
- Be concise. Markdown allowed (lists, bold). Keep answers under ~250 words.

CONTEXT (numbered claims from the approved knowledge base):
${contextBlock}`;

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway(modelId);

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
