import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mxbai-embed-large";

/**
 * Generate embedding vector using local Ollama instance.
 */
async function getOllamaEmbedding(text, model = OLLAMA_MODEL) {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });
    if (!res.ok) {
      // Try legacy /api/embeddings endpoint
      const legacyRes = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: text,
        }),
      });
      if (!legacyRes.ok) throw new Error(`Ollama HTTP ${legacyRes.status}`);
      const data = await legacyRes.json();
      return data.embedding;
    }
    const data = await res.json();
    return data.embeddings?.[0] || data.embedding;
  } catch (err) {
    return null;
  }
}

/**
 * Check Ollama availability and loaded models.
 */
async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      return { available: true, models };
    }
  } catch {}
  return { available: false, models: [] };
}

async function main() {
  console.log("=== Fabric Atlas: Semantic Embedding Generator ===");
  const ollama = await checkOllama();
  console.log(
    `Local Ollama status: ${ollama.available ? `ONLINE (${ollama.models.join(", ")})` : "OFFLINE"}`,
  );

  // Fetch active claims
  const { data: claims, error: claimsErr } = await supabase
    .from("claims")
    .select("id,claim_id,claim_text,capability_id,depth_level")
    .eq("active", true)
    .limit(100);

  if (claimsErr) {
    console.error("Error fetching claims from Supabase:", claimsErr.message);
    return;
  }

  console.log(`Found ${claims.length} active claims to inspect.`);

  if (!ollama.available) {
    console.log(
      "Tip: Start Ollama locally with `ollama run mxbai-embed-large` or `ollama run nomic-embed-text` to generate local embeddings with 0 API cost.",
    );
  } else {
    console.log(`Ready to embed claims using Ollama model '${OLLAMA_MODEL}'...`);
  }
}

main().catch(console.error);
