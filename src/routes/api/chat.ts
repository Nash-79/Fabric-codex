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

        // Postgres full-text search across claims/blogs/sources/topics (ranked).
        // Fall back to ILIKE on claims if FTS finds nothing (e.g. very short queries).
        const term = userText.slice(0, 500);
        let claims: any[] = [];
        const blogs: any[] = [];
        const sources: any[] = [];
        const topics: any[] = [];

        if (term) {
          const { data: hits } = await supabaseAdmin.rpc("search_atlas", {
            term,
            max_results: 40,
          });
          for (const h of ((hits ?? []) as Array<{ kind: string; payload: any }>)) {
            if (h.kind === "claim" && claims.length < 16) claims.push(h.payload);
            else if (h.kind === "blog" && blogs.length < 4) blogs.push(h.payload);
            else if (h.kind === "source" && sources.length < 6) sources.push(h.payload);
            else if (h.kind === "topic" && topics.length < 4) topics.push(h.payload);
          }
        }

        if (claims.length === 0 && term) {
          const words = term
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 6);
          if (words.length) {
            const ors = words.map((w) => `text.ilike.%${w}%`).join(",");
            const { data: fallback } = await supabaseAdmin
              .from("claims")
              .select("id,text,depth,capability_id,sources(slug,title,url,tier)")
              .eq("active", true)
              .or(ors)
              .limit(12);
            claims = (fallback ?? []).map((c: any) => ({
              id: c.id,
              text: c.text,
              depth: c.depth,
              capability_id: c.capability_id,
              sources: c.sources,
            }));
          }
        }

        const claimsBlock = claims.length
          ? claims
              .map(
                (c: any, i: number) =>
                  `[C${i + 1}] (capability=${c.capability_id}, depth=L${c.depth}, tier=T${c.sources?.tier ?? 6}) ${c.text}\n    source: ${c.sources?.title} — ${c.sources?.url}`,
              )
              .join("\n\n")
          : "(no matching claims found in the atlas)";
        const blogsBlock = blogs.length
          ? blogs
              .map(
                (b: any, i: number) =>
                  `[B${i + 1}] ${b.title} — /blog/${b.slug}\n    ${b.summary ?? ""}`,
              )
              .join("\n\n")
          : "";
        const sourcesBlock = sources.length
          ? sources
              .map(
                (s: any, i: number) =>
                  `[S${i + 1}] (tier=T${s.tier ?? 6}) ${s.title} — ${s.url}`,
              )
              .join("\n")
          : "";
        const topicsBlock = topics.length
          ? topics
              .map((t: any, i: number) => `[T${i + 1}] ${t.name} — /topics/${t.slug}`)
              .join("\n")
          : "";

        const contextBlock = [
          `CLAIMS (atomic, source-grounded — cite as [C#]):\n${claimsBlock}`,
          blogsBlock && `RELATED PORTAL ARTICLES (link as [B#] when useful):\n${blogsBlock}`,
          sourcesBlock && `RELATED SOURCES (background):\n${sourcesBlock}`,
          topicsBlock && `RELATED TOPICS:\n${topicsBlock}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const system = `You are the Fabric Atlas Advisor — an expert on Microsoft Fabric grounded ONLY in the approved Fabric Atlas knowledge base. The CONTEXT below is retrieved by full-text search over curated, source-graded claims (tiers T1=Microsoft Learn best → T6=unknown) and the portal's published blogs/topics.

Rules (non-negotiable):
- Cite every factual statement inline with [C1], [C2], etc. matching the claim numbers in CONTEXT.
- When useful, point readers to related portal articles as [B#] (path /blog/<slug>) or topics as [T#] (path /topics/<slug>).
- If CLAIMS is empty or insufficient to answer, reply exactly: "The Fabric Atlas is silent on this — no approved claims cover it yet." Suggest 1–2 capabilities or topics worth ingesting next. Do not invent.
- Distinguish verified fact from your own reasoning: prefix inferences with "_Inference:_ ".
- Never invent Microsoft Fabric product limits, quotas, pricing, SKUs, or roadmap.
- Prefer higher-tier sources (T1/T2) when claims conflict, and call out the conflict.
- Be thorough but readable. Use markdown (headings, bullets, **bold**, tables when comparing). Aim for ~250–500 words depending on question complexity; longer is fine for walkthroughs.
- For "walk me through" / "how do I" questions, give numbered steps, each step citing the claims it relies on.
- End with a brief "Sources" legend mapping [C#] → source title (already in CONTEXT).

CONTEXT (retrieved from the Fabric Atlas knowledge base):
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
