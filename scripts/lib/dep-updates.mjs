// Dependency freshness for the small set of packages we deliberately track.
//
// Upgrades are a local, tested, human-committed step — never an auto-merged PR.
// This module only *reports*; applying an upgrade is `npm install <pkg>@<version>`
// followed by the gate in docs/dependencies.md.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Packages worth a session-level nudge. Keep this list short and deliberate —
// this is not a whole-tree audit; that is what `npm outdated` is for.
export const WATCHED = ["feedsmith"];

// Mirrors `minimumReleaseAge` in bunfig.toml. npm ignores bunfig.toml entirely,
// so when the install runs through npm this check is the only thing applying the
// 24h supply-chain hold on freshly published versions.
export const MIN_RELEASE_AGE_MS = 86_400_000;

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 5_000;

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? "");
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

// Prereleases (3.0.0-beta.5, -rc.3, -next.6) are never offered: we track the
// stable line only.
function isStable(version) {
  return /^\d+\.\d+\.\d+$/.test(version ?? "");
}

function compare(a, b) {
  if (!a || !b) return 0;
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function installedVersion(name, root) {
  const manifest = resolve(root, "package.json");
  if (!existsSync(manifest)) return "";
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const range = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "";
  return range.replace(/^[\^~>=<\s]+/, "");
}

async function fetchLatest(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
      signal: controller.signal,
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reports each watched package as one of:
 *   current — installed is at or ahead of the latest stable
 *   update  — a stable upgrade is available and past the release-age hold
 *   held    — a newer stable exists but is younger than MIN_RELEASE_AGE_MS
 *   unknown — registry unreachable or package not installed (never an error)
 *
 * Never throws and never sets a non-zero exit code: being offline is not a
 * finding, and this runs inside the SessionStart hook.
 */
export async function collectDepUpdates(root = resolve(import.meta.dirname, "..", "..")) {
  const packages = [];
  for (const name of WATCHED) {
    const installed = installedVersion(name, root);
    if (!installed) {
      packages.push({ name, installed: "", latest: "", state: "unknown", major: false });
      continue;
    }
    try {
      const meta = await fetchLatest(name);
      const latest = meta["dist-tags"]?.latest ?? "";
      const current = parseVersion(installed);
      const next = parseVersion(latest);
      if (!isStable(latest) || !next || compare(next, current) <= 0) {
        packages.push({ name, installed, latest, state: "current", major: false });
        continue;
      }
      const published = meta.time?.[latest];
      const age = published ? Date.now() - new Date(published).getTime() : Number.POSITIVE_INFINITY;
      packages.push({
        name,
        installed,
        latest,
        state: age < MIN_RELEASE_AGE_MS ? "held" : "update",
        major: next.major > current.major,
      });
    } catch {
      // Registry unreachable — report unknown rather than alarming the session.
      packages.push({ name, installed, latest: "", state: "unknown", major: false });
    }
  }
  return {
    packages,
    updates: packages.filter((p) => p.state === "update").length,
    held: packages.filter((p) => p.state === "held").length,
  };
}

/** The ready-to-paste upgrade command, matching the digest's next-action style. */
export function upgradeCommand(pkg) {
  return `npm install ${pkg.name}@${pkg.latest} && npm test # ${pkg.major ? "MAJOR " : ""}upgrade from ${pkg.installed}`;
}
