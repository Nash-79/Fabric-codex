/**
 * The one place that knows this deployment's public address.
 *
 * It was previously hardcoded as `fabric-atlas.lovable.app` in five places, including the
 * User-Agent strings the RSS poller and source watcher send to publishers. Those strings are a
 * courtesy and a contact point -- a crawler that identifies itself with an address that no longer
 * resolves is worse than one that says nothing, because a site owner cannot check who is polling
 * them or ask to be excluded.
 *
 * Set FABRIC_ATLAS_APP_URL as a Worker variable after the first deploy. Moving to a custom domain
 * later is then a variable change, not a code change.
 */

const DEFAULT_APP_URL = "https://fabric-codex.workers.dev";

function readEnv(name: string): string | undefined {
  // Guarded: this module is imported by both server code (process.env) and, indirectly, by
  // client bundles where `process` does not exist.
  if (typeof process !== "undefined" && process.env?.[name]) return process.env[name];
  return undefined;
}

/** Public origin, no trailing slash. */
export function appUrl(): string {
  const raw = readEnv("FABRIC_ATLAS_APP_URL") ?? DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * Identify an outbound crawler honestly: a product token, a version, and a URL a publisher can
 * visit to find out who is polling them.
 */
export function crawlerUserAgent(product: string, version = "1.0"): string {
  return `${product}/${version} (+${appUrl()}/)`;
}
