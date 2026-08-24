// Token-authenticated sink for locally-computed claim embeddings (WP3.1 / defect D4).
//
// `scripts/generate-embeddings.mjs` runs on the author's laptop with a local Ollama model, then
// POSTs batches here. The server writes them with the service-role client, which is the only key
// permitted to write `claims` and is never available outside the deployed app.
//
// Auth reuses the existing agent bearer token (FABRIC_ATLAS_AGENT_READ_TOKEN) rather than
// introducing a second secret. The token is compared in constant time by `authorizeAgentRead`.
// This endpoint is deliberately write-narrow: it can only set `embedding`/`embedding_model` on
// existing claim rows, and cannot create, delete, or otherwise mutate content.

import { createFileRoute } from "@tanstack/react-router";
import { authorizeAgentRead } from "@/lib/agent-read.server";

export const Route = createFileRoute("/api/public/hooks/claim-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizeAgentRead(request)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let body: { model?: string; items?: { claimId: string; embedding: number[] }[] };
        try {
          const raw = await request.text();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }

        try {
          const { writeClaimEmbeddingsCore } = await import("@/lib/claim-embeddings.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await writeClaimEmbeddingsCore(
            supabaseAdmin,
            body.model ?? "",
            body.items ?? [],
          );
          await supabaseAdmin.from("admin_audit_events").insert({
            actor_id: null,
            action: "claims.embeddings_written_by_hook",
            target_type: "hook",
            target_id: "claim-embeddings",
            metadata: { model: body.model, ...result, missing: result.missing.length } as any,
          });
          return Response.json(
            { ok: true, ...result },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          // A validation failure is the caller's fault (400); anything else is ours (503).
          const message = error instanceof Error ? error.message : "Embedding write failed.";
          const isValidation =
            /required|supplied|at most|dimension|non-finite|needs a claimId/i.test(message);
          return Response.json(
            { ok: false, error: message },
            { status: isValidation ? 400 : 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
