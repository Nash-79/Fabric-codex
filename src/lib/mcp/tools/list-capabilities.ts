import { defineTool } from "@lovable.dev/mcp-js";
import { listCapabilities } from "@/lib/atlas.functions";

export default defineTool({
  name: "list_capabilities",
  title: "List Fabric capabilities",
  description:
    "List every Microsoft Fabric capability in the Fabric Codex registry (id, name, description, accent).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const rows = await listCapabilities();
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { capabilities: rows },
    };
  },
});
