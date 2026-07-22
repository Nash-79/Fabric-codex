import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    // Without this, @ai-sdk/openai-compatible defaults to false and only sends
    // response_format: { type: "json_object" } — the schema is injected as prompt text only, with
    // no provider-enforced json_schema constraint. Observed in production: google/gemini-3-flash-preview
    // repeatedly returned a bare JSON array instead of the required { ideas: [...] } wrapper, and
    // invented field names, for idea-generation's generateObject calls (logged as
    // idea.generation_failed). Setting this to true makes the SDK send response_format:
    // { type: "json_schema", json_schema: {...} }, which Lovable's gateway is expected to honor for
    // schema-capable models — a materially stronger constraint than prompt-only compliance.
    // Does not affect streamText calls (e.g. /advisor/chat) since those never set responseFormat.
    supportsStructuredOutputs: true,
  });
}
