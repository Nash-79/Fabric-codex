import { defineTool } from "@lovable.dev/mcp-js";
import { listTopics } from "@/lib/atlas.functions";

export default defineTool({
  name: "list_topics",
  title: "List Fabric topics",
  description:
    "List every topic node in the Fabric Atlas taxonomy (slug, name, parent, capability associations).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const rows = await listTopics();
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { topics: rows },
    };
  },
});
