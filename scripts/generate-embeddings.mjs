import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

// Same local .env loader `poll-watchers.mjs` uses -- `dotenv` is not a dependency of this repo,
// and importing it was one reason this script had never actually run.
// Split on LF and strip CR so the loader works on both CRLF and LF .env files.
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8")
      .split(LF)
      .map((l) => l.split(CR).join(""))) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
      }
    }
  }
}
loadEnv();

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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text";

// The deployed app writes the vectors; see postEmbeddings() below for why. Defaults to the
// production deployment so only the secret has to be configured locally.
// Default follows the Cloudflare Worker name; set FABRIC_ATLAS_APP_URL to override (a custom
// domain, or a preview deployment). The old default pointed at the retired Lovable host.
const APP_URL = process.env.FABRIC_ATLAS_APP_URL || "https://fabric-codex.workers.dev";
const AGENT_TOKEN = process.env.FABRIC_ATLAS_AGENT_READ_TOKEN || "";

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
 * Hand a batch of computed vectors to the deployed app, which writes them with the service-role
 * key. The script cannot write `claims` itself: that key is server-only and Lovable-managed, and
 * an RLS-blocked UPDATE via the anon key returns no error and no rows -- so writing directly
 * reported thousands of successes while the database stayed empty.
 */
async function postEmbeddings(items) {
  const url = `${APP_URL.replace(/\/$/, "")}/api/public/hooks/claim-embeddings`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${AGENT_TOKEN}`,
      },
      body: JSON.stringify({ model: OLLAMA_MODEL, items }),
      signal: AbortSignal.timeout(120000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    return { ok: true, written: body.written ?? 0, missing: body.missing ?? [] };
  } catch (err) {
    return { ok: false, error: `${err.name}: ${err.message}` };
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

// How many embeddings to have in flight at once. Ollama serialises internally past a point, so
// this is about hiding per-request latency, not saturating the GPU.
const CONCURRENCY = Number(process.env.EMBED_CONCURRENCY || 6);
// Must match the vector(N) column type in
// supabase/migrations/20260824120000_fix_match_claims_hybrid_columns.sql.
// nomic-embed-text emits 768; changing the model means changing both, plus a --force re-embed.
const EMBED_DIM = Number(process.env.EMBED_DIM || 768);

/**
 * Backfill `claims.embedding` for every active claim that does not have one yet.
 *
 * Re-runnable and resumable: it only ever selects rows where `embedding IS NULL`, so an
 * interrupted run picks up exactly where it stopped. `--force` re-embeds everything, which is what
 * you want after changing the model -- the vector column is a fixed 768 dims, so mixing models
 * silently degrades retrieval; `embedding_model` records which one produced each row.
 */
async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Fabric Codex: Semantic Embedding Generator ===");
  const ollama = await checkOllama();
  console.log(
    `Local Ollama status: ${ollama.available ? `ONLINE (${ollama.models.join(", ")})` : "OFFLINE"}`,
  );

  if (!AGENT_TOKEN) {
    console.error(
      `
FABRIC_ATLAS_AGENT_READ_TOKEN is not set.
` +
        `Vectors are computed here but written by ${APP_URL}, which holds the only key
` +
        `permitted to write claims. Copy .env.local.example to .env.local and set the token
` +
        `(it must match the server's), then re-run.
` +
        `No claims were modified.`,
    );
    process.exitCode = 1;
    return;
  }

  // Confirm the write endpoint exists and accepts our token BEFORE spending minutes embedding.
  // An empty batch is rejected with 400 by validation, which is exactly the signal we want: it
  // proves the route is deployed AND the token was accepted. 404 means the code has not shipped
  // yet; 401 means the token does not match the server's.
  const probe = await postEmbeddings([]);
  if (!probe.ok && !/No embeddings supplied/i.test(probe.error ?? "")) {
    const hint = /404/.test(probe.error ?? "")
      ? `The endpoint is not deployed yet -- commit and deploy, then re-run.`
      : /401|unauthorized/i.test(probe.error ?? "")
        ? `The token was rejected -- FABRIC_ATLAS_AGENT_READ_TOKEN must match the server's.`
        : `Could not reach the write endpoint.`;
    console.error(`
${hint}
  ${APP_URL}/api/public/hooks/claim-embeddings -> ${probe.error}
No claims were modified.`);
    process.exitCode = 1;
    return;
  }

  if (!ollama.available) {
    console.error(
      `
Ollama is not reachable at ${OLLAMA_HOST}.
` +
        `Start it with \`ollama pull ${OLLAMA_MODEL}\` then \`ollama serve\`, and re-run.
` +
        `No claims were modified.`,
    );
    process.exitCode = 1;
    return;
  }

  const { count: totalActive } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("active", true);
  const { count: alreadyDone } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .not("embedding", "is", null);
  const todo = force ? (totalActive ?? 0) : (totalActive ?? 0) - (alreadyDone ?? 0);
  console.log(
    `${totalActive} active claim(s); ${alreadyDone} already embedded; ` +
      `${todo} to process${force ? " (--force: re-embedding all)" : ""}.`,
  );
  if (!todo) {
    console.log("Nothing to do.");
    return;
  }
  if (dryRun) {
    console.log("--dry-run: stopping before any write.");
    return;
  }

  let embedded = 0;
  let failed = 0;

  // Stream page-by-page rather than materialising every row up front.
  //
  // Two correctness traps this avoids:
  //   - OFFSET paging over a `WHERE embedding IS NULL` filter is wrong: each row we embed leaves
  //     the filtered set, so the next `.range(from, ...)` skips that many unprocessed rows. Resume
  //     runs must always re-read from the START of the still-null set, never from a saved offset.
  //   - `--force` has no shrinking filter, so it pages by keyset on `id` instead, which is stable
  //     while rows are being rewritten.
  const PAGE = 200;
  let cursorId = null;
  for (;;) {
    let query = supabase
      .from("claims")
      // NOTE: the column is `text`, not `claim_text`; `depth`, not `depth_level`. An earlier
      // version of this script selected the latter and silently failed against the real schema.
      .select("id,text")
      .eq("active", true)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (force) {
      if (cursorId) query = query.gt("id", cursorId);
    } else {
      query = query.is("embedding", null);
    }

    const { data: page, error: claimsErr } = await query;
    if (claimsErr) {
      console.error("Error fetching claims from Supabase:", claimsErr.message);
      process.exitCode = 1;
      return;
    }
    if (!page?.length) break;
    cursorId = page[page.length - 1].id;

    const batch = page.filter((c) => c.text && c.text.trim());

    // Compute the page's vectors locally, then hand the whole batch to the server in one request.
    // Ollama handles a handful of concurrent requests comfortably and embedding is the entire
    // runtime cost of this job; strictly sequential took ~50 minutes for 3k claims.
    const computed = [];
    let cursor = 0;
    async function worker() {
      while (cursor < batch.length) {
        const claim = batch[cursor++];
        const vector = await getOllamaEmbedding(claim.text);
        if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
          // Wrong dimensions means the wrong model is loaded -- sending it would be rejected by
          // the server anyway, so skip and report rather than guessing.
          failed++;
          if (Array.isArray(vector)) {
            console.warn(
              `  ! claim ${claim.id}: model returned ${vector.length} dims, expected ${EMBED_DIM} -- skipped`,
            );
          }
          continue;
        }
        computed.push({ claimId: claim.id, embedding: vector });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (computed.length) {
      const result = await postEmbeddings(computed);
      if (!result.ok) {
        console.error(`
Server rejected the batch: ${result.error}`);
        console.error("No further claims were processed.");
        process.exitCode = 1;
        return;
      }
      embedded += result.written;
      if (result.missing?.length) {
        failed += result.missing.length;
        console.warn(`  ! ${result.missing.length} claim id(s) matched no row and were skipped`);
      }
    }

    console.log(
      `  ${embedded + failed}/${todo} processed (${embedded} embedded, ${failed} failed)`,
    );

    // Guard against a non-advancing loop: without --force the filter shrinks each pass, so a page
    // that wrote nothing at all would otherwise spin forever on the same rows.
    if (!force && batch.length && !computed.length) {
      console.error("No claim in this page could be embedded; stopping rather than looping.");
      break;
    }
  }

  console.log(`
Embedded ${embedded} claim(s) with '${OLLAMA_MODEL}'; ${failed} failed/skipped.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
