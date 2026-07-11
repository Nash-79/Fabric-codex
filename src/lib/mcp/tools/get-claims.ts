import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { listClaimsByCapability } from "@/lib/atlas.functions";

export default defineTool({
  name: "get_claims",
  title: "Get source-cited claims",
  description:
    "Return source-cited claims from the Fabric Atlas knowledge base, optionally filtered by capability id, depth (1-5), trust tier (1-6), or a free-text query.",
  inputSchema: {
    capabilityId: z
      .string()
      .optional()
      .describe("Capability id, e.g. 'direct-lake', 'onelake', 'spark'."),
    depth: z.number().int().min(1).max(5).optional().describe("Depth level 1-5."),
    tier: z.number().int().min(1).max(6).optional().describe("Trust tier 1 (best) - 6 (unknown)."),
    q: z.string().optional().describe("Free-text search over claim text."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max claims to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input) => {
    const rows = await listClaimsByCapability({
      data: { ...input, limit: input.limit ?? 20 },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { claims: rows },
    };
  },
});
