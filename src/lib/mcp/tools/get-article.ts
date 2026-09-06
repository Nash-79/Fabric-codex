import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getContentItem } from "@/lib/atlas.functions";

export default defineTool({
  name: "get_article",
  title: "Get Fabric Codex article",
  description:
    "Fetch the full body (markdown), summary, and cited sources for one Fabric Codex content item (article, design, or lesson).",
  inputSchema: {
    kind: z.enum(["article", "design", "lesson"]).describe("Content kind."),
    slug: z.string().min(1).describe("Content item slug."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, slug }) => {
    const item = await getContentItem({ data: { kind, slug } });
    return {
      content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
      structuredContent: { item },
    };
  },
});
