import type {
  AuthoredDiagram,
  AuthoredDiagramEdge,
  AuthoredDiagramNode,
  DiagramEdge,
  DiagramLane,
  DiagramNode,
  InteractiveDiagramDefinition,
} from "./types";

/**
 * Layered graph layout. Replaces the old fixed `x: 55 + column * 315` grid, which forced every
 * diagram — decision tree, query path, platform overview — into the same 3-column block.
 *
 * Ranks come from the edge graph (longest path), so topology reflects meaning. Within a rank,
 * nodes are ordered by the barycentre of their neighbours to cut edge crossings. Boxes are sized
 * to their text. Edges are routed orthogonally rather than drawn centre-to-centre.
 */

const NODE_MIN_WIDTH = 190;
const NODE_MAX_WIDTH = 260;
const NODE_MIN_HEIGHT = 96;
const CHAR_WIDTH = 8.1;
const LINE_HEIGHT = 21;
const LABEL_PAD_X = 30;
const CLASSIFICATION_BAND = 26;

const RANK_GAP = 132;
const SIBLING_GAP = 34;
const MARGIN_X = 48;
const MARGIN_TOP = 96;
const MARGIN_BOTTOM = 48;
const LANE_LABEL_GUTTER = 128;

/** `feedback` edges intentionally point backwards; they must not sink the target's rank. */
function forwardEdges(edges: AuthoredDiagramEdge[]) {
  return edges.filter((edge) => edge.kind !== "feedback");
}

export function wrapLabel(text: string, maxWidth: number): string[] {
  const maxChars = Math.max(8, Math.floor((maxWidth - LABEL_PAD_X * 2) / CHAR_WIDTH));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function measure(node: AuthoredDiagramNode) {
  const longestWord = node.label.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  const natural = node.label.length * CHAR_WIDTH + LABEL_PAD_X * 2;
  const width = Math.round(
    Math.min(
      NODE_MAX_WIDTH,
      Math.max(NODE_MIN_WIDTH, longestWord * CHAR_WIDTH + LABEL_PAD_X * 2, natural / 2),
    ),
  );
  const lines = wrapLabel(node.label, width);
  const height = Math.max(NODE_MIN_HEIGHT, lines.length * LINE_HEIGHT + CLASSIFICATION_BAND + 42);
  return { width, height, lines };
}

/**
 * Longest-path ranking. A node sits one rank below its deepest predecessor, so a diamond
 * (A→B, A→C, B→D, C→D) puts D on a single rank instead of two — which is what makes a decision
 * tree read as a tree.
 */
function rankNodes(nodes: AuthoredDiagramNode[], edges: AuthoredDiagramEdge[]) {
  const forward = forwardEdges(edges);
  const incoming = new Map<string, string[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of forward) incoming.get(edge.to)?.push(edge.from);

  const rank = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    const pinned = nodes.find((node) => node.id === id)?.rank;
    if (typeof pinned === "number") return pinned;
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    // Cycle guard: a malformed graph must degrade, not hang.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length ? Math.max(...parents.map((parent) => resolve(parent) + 1)) : 0;
    visiting.delete(id);
    rank.set(id, value);
    return value;
  };

  for (const node of nodes) resolve(node.id);
  return rank;
}

/** Barycentre ordering — pull each node toward the average position of its neighbours. */
function orderWithinRanks(ranks: Map<number, AuthoredDiagramNode[]>, edges: AuthoredDiagramEdge[]) {
  const forward = forwardEdges(edges);
  const sortedRanks = [...ranks.keys()].sort((a, b) => a - b);
  const positionOf = new Map<string, number>();
  for (const rank of sortedRanks) {
    ranks.get(rank)!.forEach((node, index) => positionOf.set(node.id, index));
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (const rank of sortedRanks) {
      const row = ranks.get(rank)!;
      const barycentre = new Map<string, number>();
      for (const node of row) {
        const neighbours = forward
          .filter((edge) => edge.to === node.id || edge.from === node.id)
          .map((edge) => (edge.to === node.id ? edge.from : edge.to))
          .map((id) => positionOf.get(id))
          .filter((value): value is number => value !== undefined);
        barycentre.set(
          node.id,
          neighbours.length
            ? neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
            : (positionOf.get(node.id) ?? 0),
        );
      }
      row.sort((a, b) => (barycentre.get(a.id) ?? 0) - (barycentre.get(b.id) ?? 0));
      row.forEach((node, index) => positionOf.set(node.id, index));
    }
  }
  return sortedRanks;
}

/**
 * Orthogonal route between two placed boxes. Vertical diagrams exit the bottom edge and enter the
 * top; horizontal ones exit the right and enter the left. A jog at the midpoint keeps parallel
 * edges from overlapping into a single unreadable line.
 */
function routeEdge(from: DiagramNode, to: DiagramNode, horizontal: boolean) {
  if (horizontal) {
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const mid = x1 + (x2 - x1) / 2;
    const path =
      Math.abs(y1 - y2) < 2
        ? `M ${x1} ${y1} L ${x2} ${y2}`
        : `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
    return { path, labelX: mid, labelY: (y1 + y2) / 2 - 8 };
  }
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const mid = y1 + (y2 - y1) / 2;
  const path =
    Math.abs(x1 - x2) < 2
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`;
  return { path, labelX: (x1 + x2) / 2, labelY: mid - 8 };
}

/** A backward edge can't be routed through the layers, so it arcs around the outside. */
function routeFeedback(from: DiagramNode, to: DiagramNode, horizontal: boolean) {
  if (horizontal) {
    const y = Math.max(from.y + from.height, to.y + to.height) + 34;
    const x1 = from.x + from.width / 2;
    const x2 = to.x + to.width / 2;
    return {
      path: `M ${x1} ${from.y + from.height} L ${x1} ${y} L ${x2} ${y} L ${x2} ${to.y + to.height}`,
      labelX: (x1 + x2) / 2,
      labelY: y - 8,
    };
  }
  const x = Math.max(from.x + from.width, to.x + to.width) + 34;
  const y1 = from.y + from.height / 2;
  const y2 = to.y + to.height / 2;
  return {
    path: `M ${from.x + from.width} ${y1} L ${x} ${y1} L ${x} ${y2} L ${to.x + to.width} ${y2}`,
    labelX: x + 8,
    labelY: (y1 + y2) / 2,
  };
}

const laneTitles: Record<string, string[]> = {
  decision: ["Start here", "Evaluate", "Branch", "Decide", "Outcome"],
  flow: ["Source", "Ingest", "Process", "Serve", "Consume"],
  internals: ["Entry", "Engine", "Execution", "Result"],
};

/**
 * Lay an authored diagram out for rendering.
 *
 * `decision` trees and `internals`/`flow` paths read top-down; architectures read left-to-right
 * across layered lanes. The `type` field was previously computed and then ignored — this is where
 * it finally does something.
 */
export function layoutDiagram(authored: AuthoredDiagram): InteractiveDiagramDefinition {
  const rank = rankNodes(authored.nodes, authored.edges);

  const ranks = new Map<number, AuthoredDiagramNode[]>();
  for (const node of authored.nodes) {
    const value = rank.get(node.id) ?? 0;
    if (!ranks.has(value)) ranks.set(value, []);
    ranks.get(value)!.push(node);
  }
  const sortedRanks = orderWithinRanks(ranks, authored.edges);

  /**
   * Orientation follows the graph's actual shape, not just its declared type.
   *
   * `architecture` prefers left-to-right lanes, but a deep, narrow graph (say 6 ranks of 1–2 nodes)
   * laid out horizontally becomes an ultra-wide strip. Scaled to fit an article column that squashes
   * every node to a few dozen pixels — unreadable, and unclickable. When the graph is deeper than it
   * is wide, run it top-down instead and let the page scroll vertically, which is the direction a
   * reader already scrolls.
   */
  const depth = sortedRanks.length;
  const breadth = Math.max(...[...ranks.values()].map((row) => row.length), 1);
  const declaredHorizontal = authored.type === "architecture" || authored.type === "model";
  const horizontal = declaredHorizontal && depth <= Math.max(3, breadth + 1);

  const sizes = new Map(authored.nodes.map((node) => [node.id, measure(node)] as const));

  // Cross-axis extent of each rank, so ranks can be centred against the widest one.
  const rankExtent = new Map<number, number>();
  for (const value of sortedRanks) {
    const row = ranks.get(value)!;
    const extent = row.reduce((sum, node, index) => {
      const size = sizes.get(node.id)!;
      return sum + (horizontal ? size.height : size.width) + (index ? SIBLING_GAP : 0);
    }, 0);
    rankExtent.set(value, extent);
  }
  const maxExtent = Math.max(...rankExtent.values(), 0);

  // Along-axis extent of each rank is set by its deepest/widest box.
  const rankThickness = new Map<number, number>();
  for (const value of sortedRanks) {
    const row = ranks.get(value)!;
    const thickness = row.reduce((max, node) => {
      const size = sizes.get(node.id)!;
      return Math.max(max, horizontal ? size.width : size.height);
    }, 0);
    rankThickness.set(value, thickness);
  }

  const placed: DiagramNode[] = [];
  const lanes: DiagramLane[] = [];
  const originAlong = horizontal ? MARGIN_X + LANE_LABEL_GUTTER : MARGIN_TOP;
  let along = originAlong;

  for (const value of sortedRanks) {
    const row = ranks.get(value)!;
    const thickness = rankThickness.get(value)!;
    const extent = rankExtent.get(value)!;
    // Centre the rank across the widest rank so the graph reads as a spine, not a ragged edge.
    let across = (horizontal ? MARGIN_TOP : MARGIN_X) + (maxExtent - extent) / 2;

    for (const node of row) {
      const size = sizes.get(node.id)!;
      placed.push({
        ...node,
        x: horizontal ? along + (thickness - size.width) / 2 : across,
        y: horizontal ? across : along + (thickness - size.height) / 2,
        width: size.width,
        height: size.height,
      });
      across += (horizontal ? size.height : size.width) + SIBLING_GAP;
    }

    const titles = laneTitles[authored.type];
    if (titles) {
      lanes.push({
        id: `lane-${value}`,
        label: titles[Math.min(value, titles.length - 1)] ?? `Stage ${value + 1}`,
        x: horizontal ? along : MARGIN_X,
        y: horizontal ? MARGIN_TOP - 40 : along,
        width: horizontal ? thickness : MARGIN_X + maxExtent,
        height: horizontal ? MARGIN_TOP + maxExtent : thickness,
      });
    }

    along += thickness + RANK_GAP;
  }

  const byId = new Map(placed.map((node) => [node.id, node] as const));
  const edges: DiagramEdge[] = authored.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const route =
      edge.kind === "feedback"
        ? routeFeedback(from, to, horizontal)
        : routeEdge(from, to, horizontal);
    return [{ ...edge, ...route }];
  });

  const width = horizontal ? along - RANK_GAP + MARGIN_X : MARGIN_X * 2 + maxExtent;
  const height = horizontal
    ? MARGIN_TOP + maxExtent + MARGIN_BOTTOM
    : along - RANK_GAP + MARGIN_BOTTOM;

  return {
    ...authored,
    viewBox: { width: Math.round(width), height: Math.round(height) },
    nodes: placed,
    edges,
    lanes,
  };
}
