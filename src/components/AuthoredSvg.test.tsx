import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeAll } from "vitest";
import { AuthoredSvg } from "@/components/AuthoredSvg";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { allAuthoredDiagrams, loadAuthoredDiagram } from "@/diagrams/catalog";
import type { AuthoredDiagram } from "@/diagrams/types";

describe("authored SVG diagram contract", () => {
  let diagrams: AuthoredDiagram[];
  let svgById: Map<string, string>;

  beforeAll(async () => {
    diagrams = await allAuthoredDiagrams();
    // Loaded in parallel, not one at a time — 95 sequential awaits was slow enough to blow the
    // default 10s beforeAll timeout under load (e.g. the full suite running alongside 16 other
    // test files), even though each individual load is fast.
    const loaded = await Promise.all(diagrams.map((d) => loadAuthoredDiagram(d.id)));
    svgById = new Map(diagrams.map((d, i) => [d.id, loaded[i]!.markup]));
  }, 30_000); // 95 file reads in parallel; default 10s can be tight under a loaded machine/CI runner

  it("pairs every authored node with one accessible SVG region", () => {
    expect(diagrams.length).toBeGreaterThan(0);

    for (const diagram of diagrams) {
      const svg = svgById.get(diagram.id);
      expect(svg, diagram.id).toBeTruthy();
      expect(svg, diagram.id).toContain("<title id=");
      expect(svg, diagram.id).toContain("<desc id=");
      expect(svg, diagram.id).toContain('role="img"');
      for (const node of diagram.nodes) {
        const matches = svg!.match(new RegExp(`data-node-id=["']${node.id}["']`, "g"));
        expect(matches, `${diagram.id}/${node.id}`).toHaveLength(1);
      }
    }
  });

  it("renders the authored artwork without the retired graph explorer", () => {
    const diagram = diagrams.find((item) => item.id === "direct-lake-query-path")!;
    const markup = renderToStaticMarkup(
      <AuthoredSvg markup={svgById.get(diagram.id)!} definition={diagram} />,
    );

    expect(markup).toContain('data-diagram-id="direct-lake-query-path"');
    expect(markup).not.toContain("Interactive explorer");
    expect(markup).not.toContain("Infographic view");
  });

  it("keeps a static SVG fallback when JavaScript is unavailable", () => {
    const diagram = diagrams.find((item) => item.id === "direct-lake-query-path")!;
    const markup = renderToStaticMarkup(
      <DiagramLightbox
        src={diagram.staticPath}
        alt={diagram.title}
        svgMarkup={svgById.get(diagram.id)!}
        definition={diagram}
      />,
    );

    expect(markup).toContain("<noscript>");
    expect(markup).toContain(`src="${diagram.staticPath}"`);
    expect(markup).not.toContain("Interactive explorer");
  });
});
