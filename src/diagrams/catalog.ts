import type { AuthoredDiagram } from "./types";

// Keys only — cheap, synchronous. import.meta.glob without `eager` still resolves the module
// path map at build time; each value is a () => Promise<module> loader, not the module itself.
const sidecarLoaders = import.meta.glob<{ default: AuthoredDiagram }>(
  "../../content/diagrams/*.diagram.json",
);

const svgLoaders = import.meta.glob<string>("../../content/diagrams/*.svg", {
  query: "?raw",
  import: "default",
});

function slugFromPath(path: string) {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.(diagram\.json|svg|mmd)$/i, "") ?? path
  );
}

const sidecarLoaderBySlug = new Map<string, () => Promise<{ default: AuthoredDiagram }>>(
  Object.entries(sidecarLoaders).map(([path, loader]) => [slugFromPath(path), loader]),
);

const svgLoaderBySlug = new Map<string, () => Promise<string>>(
  Object.entries(svgLoaders).map(([path, loader]) => [slugFromPath(path), loader]),
);

// In-memory cache so repeated lightbox opens / drillTarget navigation don't re-fetch.
const sidecarCache = new Map<string, AuthoredDiagram>();
const svgCache = new Map<string, string>();

/** Synchronous — the manifest of known slugs is available at build time with no fetch. */
export function isAuthored(slugOrPath: string) {
  return sidecarLoaderBySlug.has(slugFromPath(slugOrPath));
}

/** All known diagram slugs, without loading their content. Used for validation/indexing. */
export function allAuthoredDiagramSlugs() {
  return [...sidecarLoaderBySlug.keys()];
}

/**
 * Loads one diagram's sidecar + SVG markup on demand. Both files are fetched together since every
 * consumer (DiagramLightbox, InteractiveDiagram) needs the pair to render anything. Cached after
 * first load so repeat opens are free.
 */
export async function loadAuthoredDiagram(
  slugOrPath: string,
): Promise<{ definition: AuthoredDiagram; markup: string } | null> {
  const slug = slugFromPath(slugOrPath);
  const sidecarLoader = sidecarLoaderBySlug.get(slug);
  const svgLoader = svgLoaderBySlug.get(slug);
  if (!sidecarLoader || !svgLoader) return null;

  const [definition, markup] = await Promise.all([
    sidecarCache.get(slug) ?? sidecarLoader().then((m) => m.default),
    svgCache.get(slug) ?? svgLoader(),
  ]);
  sidecarCache.set(slug, definition);
  svgCache.set(slug, markup);
  return { definition, markup };
}

/**
 * Complete authored catalog used by content publishing and diagram-node indexing (build-time
 * scripts, not the browser bundle — safe to eagerly resolve every sidecar here).
 */
export async function allAuthoredDiagrams(): Promise<AuthoredDiagram[]> {
  const slugs = allAuthoredDiagramSlugs();
  const loaded = await Promise.all(
    slugs.map(async (slug) => {
      const cached = sidecarCache.get(slug);
      if (cached) return cached;
      const loader = sidecarLoaderBySlug.get(slug);
      const def = await loader!().then((m) => m.default);
      sidecarCache.set(slug, def);
      return def;
    }),
  );
  return loaded;
}
