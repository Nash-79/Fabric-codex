import { describe, expect, it } from "vitest";
import { interactiveDiagramCatalog } from "@/diagrams/catalog";
import { layoutDiagram } from "@/diagrams/layout";
import type { AuthoredDiagram } from "@/diagrams/types";

const sidecars = Object.values(
  import.meta.glob<{ default: AuthoredDiagram }>("../../content/diagrams/*.diagram.json", {
    eager: true,
  }),
).map((module) => module.default);

describe("layout engine", () => {
  it("finds authored sidecars to exercise", () => {
    expect(sidecars.length).toBeGreaterThan(0);
  });

  for (const authored of sidecars) {
    describe(authored.id, () => {
      const laid = layoutDiagram(authored);

      it("places every node and routes every edge", () => {
        expect(laid.nodes).toHaveLength(authored.nodes.length);
        expect(laid.edges).toHaveLength(authored.edges.length);
        for (const edge of laid.edges) expect(edge.path).toMatch(/^M /);
      });

      it("keeps every node inside the canvas", () => {
        expect(laid.viewBox.width).toBeGreaterThan(0);
        expect(laid.viewBox.height).toBeGreaterThan(0);
        for (const node of laid.nodes) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.y).toBeGreaterThanOrEqual(0);
          expect(node.x + node.width).toBeLessThanOrEqual(laid.viewBox.width);
          expect(node.y + node.height).toBeLessThanOrEqual(laid.viewBox.height);
        }
      });

      // The old renderer stamped every diagram into a fixed 3-column grid, so boxes collided and
      // the result read as noise. Overlap is the regression that matters most.
      it("never overlaps two boxes", () => {
        for (let i = 0; i < laid.nodes.length; i += 1) {
          for (let j = i + 1; j < laid.nodes.length; j += 1) {
            const a = laid.nodes[i]!;
            const b = laid.nodes[j]!;
            const overlaps =
              a.x < b.x + b.width &&
              b.x < a.x + a.width &&
              a.y < b.y + b.height &&
              b.y < a.y + a.height;
            expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
          }
        }
      });

      // Topology, not a single stack: a real graph spreads across more than one rank.
      it("derives more than one rank from the edge graph", () => {
        // The layout can rotate a deep architecture top-to-bottom to preserve readable node
        // sizes in an article column, so assert rank separation on either axis instead of
        // assuming every declared architecture remains horizontal.
        const xRanks = new Set(laid.nodes.map((node) => node.x));
        const yRanks = new Set(laid.nodes.map((node) => node.y));
        expect(Math.max(xRanks.size, yRanks.size)).toBeGreaterThan(1);
      });
    });
  }
});

describe("catalog", () => {
  // Includes the 70-odd diagrams still on the caption-derived fallback: they must still lay out.
  it("lays out every registered diagram, authored or fallback", () => {
    const all = interactiveDiagramCatalog();
    expect(all.length).toBeGreaterThan(0);
    for (const diagram of all) {
      expect(diagram.nodes.length, `${diagram.id} has no nodes`).toBeGreaterThan(0);
      expect(diagram.viewBox.width).toBeGreaterThan(0);
      for (const node of diagram.nodes) {
        expect(Number.isFinite(node.x), `${diagram.id}/${node.id} has non-finite x`).toBe(true);
        expect(Number.isFinite(node.y), `${diagram.id}/${node.id} has non-finite y`).toBe(true);
      }
    }
  });
});
