/**
 * Link + interactivity validator.
 *
 * Nothing previously checked that a link in published content actually resolves. That let a real
 * production bug ship: six design docs linked diagrams as `/content/diagrams/<x>.svg`, which the
 * dev server happens to serve (it exposes the repo's `content/` directory) but the production
 * build does not -- built output only contains `/diagrams/<x>.svg`. The links therefore worked in
 * every local check and 404'd for readers. This gate closes that gap.
 *
 * Three checks, all offline and deterministic by default:
 *
 *   1. ASSET LINKS  -- every site-absolute link to a file (`/diagrams/x.svg`, `/img/y.png`) must
 *      exist in `public/`, which is what actually gets deployed. Resolving against `content/` is
 *      explicitly NOT accepted: that is precisely the bug above.
 *   2. ROUTE LINKS  -- every internal page link (`/blogs/article/<slug>`, `/topics/<slug>`) must
 *      correspond to a real content file, so a renamed or deleted article surfaces as a failure
 *      rather than a dead link.
 *   3. INTERACTIVITY -- every diagram embedded by content must have its `.diagram.json` sidecar
 *      present with at least one node, and every `data-node-id` region in the SVG must resolve to
 *      a node in that sidecar. A focusable region with no backing node is a tooltip that opens
 *      empty -- interactivity that silently does nothing.
 *
 * `--online` additionally HEAD-checks external URLs. Off by default and never run in CI: it is
 * network-dependent, rate-limited by publishers, and would make an unrelated PR fail because a
 * third-party site was briefly down. Its findings are warnings, never failures.
 *
 * Usage:
 *   node scripts/validate-links.mjs            # offline gate (CI)
 *   node scripts/validate-links.mjs --online   # also probe external URLs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const online = process.argv.includes("--online");

const failures = [];
const warnings = [];

/** Every JSON/markdown content file, kept as raw text so links are found wherever they appear. */
function contentFiles() {
  const out = [];
  for (const dir of ["articles", "designs", "lessons", "sources", "help"]) {
    const abs = join(root, "content", dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith(".json") && !name.endsWith(".md")) continue;
      out.push({
        rel: `content/${dir}/${name}`,
        dir,
        name,
        raw: readFileSync(join(abs, name), "utf8"),
      });
    }
  }
  return out;
}

const files = contentFiles();

/** Slugs a route link may legitimately point at, derived from the files actually on disk. */
const knownSlugs = new Set();
for (const f of files) {
  if (f.dir === "articles" || f.dir === "designs" || f.dir === "lessons") {
    knownSlugs.add(f.name.replace(/\.json$/, ""));
  }
}
// Topics live in one seed tree rather than one file per topic.
const topicsPath = join(root, "content/topics.json");
if (existsSync(topicsPath)) {
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n?.slug) knownSlugs.add(n.slug);
      walk(n?.children);
    }
  };
  const parsed = JSON.parse(readFileSync(topicsPath, "utf8"));
  walk(Array.isArray(parsed) ? parsed : parsed.topics);
}

// Route prefixes that resolve to real pages rather than files on disk.
const ROUTE_PREFIXES = [
  "/blogs/article/",
  "/blogs/design/",
  "/blogs/lesson/",
  "/topics/",
  "/capabilities/",
];
// Static pages with no slug to resolve.
const STATIC_ROUTES = new Set([
  "/",
  "/search",
  "/learn",
  "/blogs",
  "/designs",
  "/topics",
  "/advisor",
  "/roadmap",
  "/help",
  "/settings",
]);

// Extensions that mean "this link is a file that must be deployed", not a page route. `.html` is
// included because the staged toolkit whitepapers are linked as /toolkit-source/<x>.html and a
// missing one should fail rather than be waved through as an unknown route.
const FILE_LINK = /\.(svg|png|jpe?g|gif|webp|pdf|json|mmd|csv|zip|html?)$/i;

// --------------------------------------------------------------- 1 + 2: links
for (const f of files) {
  const links = new Set([
    ...[...f.raw.matchAll(/\]\((\/[^)\s"']+)\)/g)].map((m) => m[1]),
    ...[...f.raw.matchAll(/"(?:url|href|src|path)"\s*:\s*"(\/[^"]+)"/g)].map((m) => m[1]),
  ]);

  for (const link of links) {
    const clean = link.split("#")[0].split("?")[0];
    if (!clean || clean === "/") continue;

    if (FILE_LINK.test(clean)) {
      // Deployed assets come from public/. Deliberately do NOT fall back to content/.
      if (existsSync(join(root, "public", clean.replace(/^\//, "")))) continue;
      const inContent = existsSync(join(root, clean.replace(/^\//, "")));
      failures.push(
        `${f.rel}: asset link "${clean}" is not in public/` +
          (inContent
            ? ` -- it exists at ${clean.replace(/^\//, "")}, which the dev server serves but the ` +
              `production build does not. Link it as /diagrams/<file> instead.`
            : " -- no such file anywhere in the repo."),
      );
      continue;
    }

    if (STATIC_ROUTES.has(clean)) continue;
    // A non-file-extension path can still be a real static asset shipped from public/ (the
    // toolkit-source whitepapers are .html, which is deliberately not in FILE_LINK because a
    // bare route like /learn must not be mistaken for a file). Resolve those before treating
    // the link as a route.
    if (existsSync(join(root, "public", clean.replace(/^\//, "")))) continue;

    const prefix = ROUTE_PREFIXES.find((p) => clean.startsWith(p));
    if (!prefix) {
      warnings.push(`${f.rel}: unrecognised internal link "${clean}" (no known route prefix)`);
      continue;
    }
    const slug = clean.slice(prefix.length).replace(/\/$/, "");
    if (slug && !knownSlugs.has(slug)) {
      failures.push(`${f.rel}: route link "${clean}" points at unknown slug "${slug}"`);
    }
  }
}

// ---------------------------------------------------------- 3: interactivity
const assetsPath = join(root, "content/diagrams/assets.json");
const registered = existsSync(assetsPath) ? JSON.parse(readFileSync(assetsPath, "utf8")) : [];
const registeredSlugs = new Set(
  registered.map((a) =>
    String(a.path)
      .replace(/^.*\//, "")
      .replace(/\.svg$/, ""),
  ),
);

// Which diagrams does published content embed? Tracked separately from the check scope so the
// summary can report reader-facing coverage.
const embedded = new Set();
for (const f of files) {
  for (const m of f.raw.matchAll(/\/diagrams\/([A-Za-z0-9._-]+)\.svg/g)) embedded.add(m[1]);
}

// Check EVERY registered diagram, not just the embedded ones. A diagram that no article embeds
// yet is still published through the asset registry and is one `![](...)` away from being reader-
// facing; scoping to embeds only would leave broken interactivity latent until the day someone
// links it.
const inScope = new Set([...registeredSlugs, ...embedded]);

for (const slug of [...inScope].sort()) {
  const svgPath = join(root, "content/diagrams", `${slug}.svg`);
  if (!existsSync(svgPath)) {
    if (!registeredSlugs.has(slug)) {
      failures.push(`content embeds /diagrams/${slug}.svg but no such authored SVG exists`);
    }
    continue;
  }
  const svg = readFileSync(svgPath, "utf8");
  const regions = [...svg.matchAll(/\bdata-node-id=["']([^"']+)["']/g)].map((m) => m[1]);

  const sidecarPath = join(root, "content/diagrams", `${slug}.diagram.json`);
  if (!existsSync(sidecarPath)) {
    if (regions.length) {
      failures.push(
        `${slug}: SVG exposes ${regions.length} focusable region(s) but has no ` +
          `${slug}.diagram.json -- every tooltip would open empty`,
      );
    }
    continue;
  }

  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
  } catch (err) {
    failures.push(`${slug}.diagram.json is not valid JSON: ${err.message}`);
    continue;
  }
  const nodeIds = new Set((sidecar.nodes ?? []).map((n) => n.id));
  if (!nodeIds.size) {
    failures.push(`${slug}.diagram.json declares no nodes -- the diagram is not interactive`);
    continue;
  }
  for (const id of new Set(regions)) {
    if (!nodeIds.has(id)) {
      failures.push(
        `${slug}: focusable region "${id}" has no matching node in ${slug}.diagram.json -- ` +
          `focusing it yields an empty tooltip`,
      );
    }
  }
  if (!regions.length) {
    warnings.push(
      `${slug}: sidecar defines ${nodeIds.size} node(s) but the SVG exposes no focusable ` +
        `region -- the diagram renders but cannot be explored`,
    );
  }
}

// ----------------------------------------------------------- optional: online
if (online) {
  // A URL that is illustrative rather than navigable: templated segments ({id}, <cluster>),
  // elided paths (/.../), example/internal hostnames, or a bare host used to name a service in
  // prose. These appear inside code samples and connection strings; probing them produces noise,
  // not findings.
  const ILLUSTRATIVE =
    /[{}<>*]|\/\.\.\.\/|\bexample\.(com|org|net)\b|\.internal\b|^https?:\/\/[^/]+\/?$/;

  const urls = new Set();
  for (const f of files) {
    for (const m of f.raw.matchAll(/https?:\/\/[^\s"'\\)]+/g)) urls.add(m[0].replace(/[.,]$/, ""));
  }
  const all = [...urls].sort();
  const skipped = all.filter((u) => ILLUSTRATIVE.test(u));
  const list = all.filter((u) => !ILLUSTRATIVE.test(u));
  console.log(
    `Probing ${list.length} external URL(s); skipping ${skipped.length} illustrative/templated.`,
  );
  // Honest client identity, matching poll-watchers.mjs: this states who we are rather than
  // impersonating a browser to defeat a challenge. Some publishers (notably the Khoros-hosted
  // community.fabric.microsoft.com) challenge all datacenter/non-browser traffic; that is a
  // gate on the checker, not evidence the link is dead, and is reported as such.
  const UA = "FabricAtlasLinkCheck/1.0 (+https://fabric-atlas.lovable.app/)";
  const CHALLENGE = new Set([401, 403, 429]);
  let index = 0;
  let challenged = 0;
  async function worker() {
    while (index < list.length) {
      const url = list[index++];
      try {
        let res = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(10000),
        });
        // Plenty of publishers reject HEAD but serve GET fine.
        if (res.status === 405 || CHALLENGE.has(res.status)) {
          res = await fetch(url, {
            redirect: "follow",
            headers: { "user-agent": UA },
            signal: AbortSignal.timeout(10000),
          });
        }
        if (CHALLENGE.has(res.status)) {
          // Not a broken link -- the publisher refused to answer an automated client.
          challenged++;
          continue;
        }
        // Warnings only: a third-party outage must not fail an unrelated PR.
        if (res.status >= 400) warnings.push(`external ${res.status}: ${url}`);
      } catch (err) {
        warnings.push(`external unreachable (${err.name}): ${url}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (challenged) {
    console.log(
      `${challenged} URL(s) bot-challenged by their publisher -- not verifiable from here, ` +
        `not reported as broken.`,
    );
  }
  // Khoros (community.fabric.microsoft.com) expires its image-CDN URLs, so `referenced` image
  // assets captured at ingestion time rot. Verified with a real browser UA + referer: they 404
  // for everyone, not just automated clients. These are stored metadata and are not rendered in
  // article bodies today, so this is data hygiene rather than a reader-visible break -- called
  // out separately so it is not lost among transient network warnings.
  const expiredImages = warnings.filter((w) => /serverpage\/image-id/.test(w)).length;
  if (expiredImages) {
    console.log(
      `${expiredImages} expired publisher image URL(s) on referenced assets (Khoros CDN rot). ` +
        `Not reader-visible: source assets are metadata, not embedded in article bodies.`,
    );
  }
}

// ----------------------------------------------------------------- reporting
for (const w of warnings) console.warn(`warn: ${w}`);
if (failures.length) {
  console.error(`\nLink validation FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `Link validation passed: ${files.length} content files; ${inScope.size} diagram(s) checked for ` +
    `interactivity (${embedded.size} embedded by content); ${warnings.length} warning(s).`,
);
