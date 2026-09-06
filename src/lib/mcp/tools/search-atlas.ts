import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { searchAll } from "@/lib/atlas.functions";

export default defineTool({
  name: "search_atlas",
  title: "Search Fabric Codex",
  description:
    "Full-text search across Fabric Codex topics, claims, sources, articles, designs, and lessons.",
  inputSchema: {
    q: z.string().min(1).describe("Search query."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ q }) => {
    const result = await searchAll({ data: { q } });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
});
