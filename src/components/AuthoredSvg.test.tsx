import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthoredSvg } from "@/components/AuthoredSvg";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { allAuthoredDiagrams, getStaticDiagramSvg } from "@/diagrams/catalog";

describe("authored SVG diagram contract", () => {
  it("pairs every authored node with one accessible SVG region", () => {
    const diagrams = allAuthoredDiagrams();
    expect(diagrams.length).toBeGreaterThan(0);

    for (const diagram of diagrams) {
      const svg = getStaticDiagramSvg(diagram.id);
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
    const diagram = allAuthoredDiagrams().find((item) => item.id === "direct-lake-query-path")!;
    const markup = renderToStaticMarkup(
      <AuthoredSvg markup={getStaticDiagramSvg(diagram.id)!} definition={diagram} />,
    );

    expect(markup).toContain('data-diagram-id="direct-lake-query-path"');
    expect(markup).not.toContain("Interactive explorer");
    expect(markup).not.toContain("Infographic view");
  });

  it("keeps a static SVG fallback when JavaScript is unavailable", () => {
    const diagram = allAuthoredDiagrams().find((item) => item.id === "direct-lake-query-path")!;
    const markup = renderToStaticMarkup(
      <DiagramLightbox
        src={diagram.staticPath}
        alt={diagram.title}
        svgMarkup={getStaticDiagramSvg(diagram.id)!}
        definition={diagram}
      />,
    );

    expect(markup).toContain("<noscript>");
    expect(markup).toContain(`src="${diagram.staticPath}"`);
    expect(markup).not.toContain("Interactive explorer");
  });
});
