import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCapabilitiesTool from "./tools/list-capabilities";
import listTopicsTool from "./tools/list-topics";
import getClaimsTool from "./tools/get-claims";
import searchAtlasTool from "./tools/search-atlas";
import getArticleTool from "./tools/get-article";

// OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy
// that SUPABASE_URL is rewritten to on publish. Vite inlines the literal at
// build time; the fallback keeps the issuer well-formed during the manifest
// extract eval, and never verifies a real token.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  // Deliberately still "fabric-atlas-mcp" after the Fabric Codex rename: this is the identifier
  // MCP clients bind to, so changing it silently breaks every existing connection. The display
  // title carries the new name; the machine name is stable by design.
  name: "fabric-atlas-mcp",
  title: "Fabric Codex MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Fabric Codex — a source-grounded knowledge base of Microsoft Fabric capabilities, cited claims, articles, designs, and lessons. Use `list_capabilities` and `list_topics` to explore the registry spine, `get_claims` to pull source-cited facts (filter by capability, depth, or trust tier), `search_atlas` for full-text lookups, and `get_article` for full content bodies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCapabilitiesTool, listTopicsTool, getClaimsTool, searchAtlasTool, getArticleTool],
});
