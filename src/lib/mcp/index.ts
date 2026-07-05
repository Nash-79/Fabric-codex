import { defineMcp } from "@lovable.dev/mcp-js";
import listCapabilitiesTool from "./tools/list-capabilities";
import listTopicsTool from "./tools/list-topics";
import getClaimsTool from "./tools/get-claims";
import searchAtlasTool from "./tools/search-atlas";
import getArticleTool from "./tools/get-article";

export default defineMcp({
  name: "fabric-atlas-mcp",
  title: "Fabric Atlas MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Fabric Atlas — a source-grounded knowledge base of Microsoft Fabric capabilities, cited claims, articles, designs, and lessons. Use `list_capabilities` and `list_topics` to explore the registry spine, `get_claims` to pull source-cited facts (filter by capability, depth, or trust tier), `search_atlas` for full-text lookups, and `get_article` for full content bodies.",
  tools: [
    listCapabilitiesTool,
    listTopicsTool,
    getClaimsTool,
    searchAtlasTool,
    getArticleTool,
  ],
});
