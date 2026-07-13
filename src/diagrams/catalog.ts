import type { AuthoredDiagram } from "./types";

const sidecarModules = import.meta.glob<{ default: AuthoredDiagram }>(
  "../../content/diagrams/*.diagram.json",
  { eager: true },
);

const staticSvgModules = import.meta.glob<string>("../../content/diagrams/*.svg", {
  eager: true,
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

const sidecars = new Map<string, AuthoredDiagram>(
  Object.entries(sidecarModules).map(([path, module]) => [slugFromPath(path), module.default]),
);

const staticSvgs = new Map<string, string>(
  Object.entries(staticSvgModules).map(([path, markup]) => [slugFromPath(path), markup]),
);

export function isAuthored(slugOrPath: string) {
  return sidecars.has(slugFromPath(slugOrPath));
}

/** Authored evidence/tooltip metadata for the static infographic renderer. */
export function getAuthoredDiagram(slugOrPath: string) {
  return sidecars.get(slugFromPath(slugOrPath));
}

/** Source-controlled SVG markup; validated as script-free before it can be published. */
export function getStaticDiagramSvg(slugOrPath: string) {
  return staticSvgs.get(slugFromPath(slugOrPath));
}

/** Complete authored catalog used by content publishing and diagram-node indexing. */
export function allAuthoredDiagrams() {
  return [...sidecars.values()];
}
