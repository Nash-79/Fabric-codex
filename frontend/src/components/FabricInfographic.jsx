import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/* An ORIGINAL, interactive Microsoft Fabric infographic (not a Microsoft asset).
   Every component is a clickable region that routes into its topic, and explains
   itself on hover/focus via an in-SVG tooltip. Rendered as inline SVG — not an
   <img> — so each <g> can carry onClick + hover/focus state.

   ─────────────────────────────────────────────────────────────────────────────
   HOW TO EXTEND THIS DIAGRAM (it is data-driven on purpose):

   • Add a component tile      → add an entry to a section's `nodes` array in SECTIONS.
   • Add a whole section       → push a new object onto SECTIONS.
   • Add a background band      → push onto BANDS.
   • Add a flow arrow           → push onto ARROWS.
   • Re-theme                   → edit PALETTE.

   Each `node`/`section` carries:
     - `slug`  : MUST match a topic slug in content/topics.json (the only app contract).
     - `desc`  : the one-line explanation shown in the hover tooltip.
   The render code is generic — it never hard-codes a component, so new content
   needs no JSX changes. Coordinates are in the 1200×760 viewBox.
   ───────────────────────────────────────────────────────────────────────────── */

const VIEW = { w: 1200, h: 760 };

const PALETTE = {
  ink: "#063D3B", muted: "#3F6259", faint: "#616161", grey: "#8A8886",
  work: { fill: "#EAF7F2", stroke: "#9AD2C5", label: "#063D3B", sub: "#3F6259" },     // workloads
  serve: { fill: "#FFFFFF", stroke: "#9AD2C5", label: "#063D3B", sub: "#3F6259" },    // consumption
  lake: { fill: "rgba(255,255,255,0.14)", stroke: "rgba(255,255,255,0.45)", label: "#FFFFFF", sub: "#D9F5EE" },
};

// Background bands (drawn first, behind everything).
const BANDS = [
  { x: 40, y: 78, w: 1120, h: 74, rx: 10, gradient: "ig-plat" },    // Platform & Governance
  { x: 40, y: 470, w: 1120, h: 120, rx: 10, gradient: "ig-lake" },  // Storage & OneLake
];

// Flow arrows: { x1,y1,x2,y2, color }.
const ARROWS = [
  { x1: 270, y1: 244, x2: 270, y2: 470, color: "#2AAC94" },
  { x1: 753, y1: 244, x2: 753, y2: 470, color: "#2AAC94" },
  { x1: 150, y1: 434, x2: 150, y2: 470, color: "#2AAC94" },
  { x1: 753, y1: 470, x2: 753, y2: 340, color: "#0E6961" },
];

// The seven sections + their clickable component tiles. `desc` is the hover explanation.
// header.onBand=true → heading sits on a coloured band, so it renders white.
const SECTIONS = [
  {
    slug: "platform", num: 1, label: "Platform & Governance",
    desc: "What Fabric is, how capacities meter compute, and how Purview governs the estate.",
    header: { x: 60, y: 104, size: 14, onBand: true },
    nodes: [
      { slug: "fabric-overview", label: "Fabric overview", sub: "workloads · items · OneLake", desc: "The SaaS analytics platform: workloads, items, workspaces, and OneLake as the common store.", x: 520, y: 92, w: 196, h: 46, variant: "lake" },
      { slug: "capacity", label: "Capacity & cost", sub: "CUs · smoothing · bursting", desc: "Capacity units, smoothing, bursting and throttling — how compute is metered and billed.", x: 726, y: 92, w: 196, h: 46, variant: "lake" },
      { slug: "governance", label: "Governance & Purview", sub: "domains · labels · lineage", desc: "Workspaces, domains, endorsement, sensitivity labels, and the Purview hub.", x: 932, y: 92, w: 208, h: 46, variant: "lake" },
    ],
  },
  {
    slug: "engineering", num: 3, label: "Data Engineering & Integration",
    desc: "Moving and shaping data: Spark notebooks, pipelines, and Dataflow Gen2.",
    header: { x: 58, y: 182 },
    nodes: [
      { slug: "spark", label: "Spark", sub: "notebooks · pools", desc: "Notebooks, Spark job definitions, and the runtime that powers engineering workloads.", x: 40, y: 194, w: 150, h: 50 },
      { slug: "data-factory", label: "Data Factory", sub: "pipelines · copy", desc: "Pipelines and copy activities for orchestrated data movement.", x: 198, y: 194, w: 150, h: 50 },
      { slug: "dataflow-gen2", label: "Dataflow Gen2", sub: "Power Query ETL", desc: "Low-code Power Query transformation into OneLake destinations.", x: 356, y: 194, w: 150, h: 50 },
    ],
  },
  {
    slug: "warehousing", num: 4, label: "Warehousing & SQL",
    desc: "T-SQL over the lake: the Warehouse, the Polaris engine, and SQL database in Fabric.",
    header: { x: 538, y: 182 },
    nodes: [
      { slug: "warehouse", label: "Warehouse", sub: "T-SQL over the lake", desc: "The T-SQL data warehouse over OneLake — caching, statistics, performance.", x: 520, y: 194, w: 150, h: 50 },
      { slug: "polaris", label: "Polaris engine", sub: "distributed query", desc: "The distributed query engine internals behind Warehouse and SQL endpoints.", x: 678, y: 194, w: 150, h: 50 },
      { slug: "sql-database", label: "SQL Database", sub: "operational + mirror", desc: "Operational SQL inside Fabric, mirrored to OneLake for analytics (translytical).", x: 836, y: 194, w: 150, h: 50 },
    ],
  },
  {
    slug: "real-time", num: 6, label: "Real-Time Intelligence",
    desc: "Streams, Eventhouses, and KQL — analytics on data in motion.",
    header: { x: 58, y: 278 },
    nodes: [
      { slug: "rti", label: "RTI · Eventstreams", sub: "Real-Time hub · Activator", desc: "Eventstreams, the Real-Time hub, and acting on streaming data.", x: 40, y: 290, w: 228, h: 50 },
      { slug: "eventhouse-kql", label: "Eventhouse / KQL", sub: "telemetry · time series", desc: "KQL databases and Eventhouses for high-volume telemetry and time series.", x: 276, y: 290, w: 230, h: 50 },
    ],
  },
  {
    slug: "bi", num: 5, label: "BI & Semantic Models",
    desc: "From Delta tables to reports: Direct Lake, semantic models, and Power BI.",
    header: { x: 538, y: 278 },
    nodes: [
      { slug: "direct-lake", label: "Direct Lake", sub: "no import", desc: "Loads Delta columns straight from OneLake — no import, no DirectQuery round trip.", x: 520, y: 290, w: 148, h: 50, variant: "serve" },
      { slug: "semantic-model", label: "Semantic model", sub: "storage modes", desc: "Storage modes, modelling, and how semantic models serve every report.", x: 676, y: 290, w: 150, h: 50, variant: "serve" },
      { slug: "power-bi", label: "Power BI", sub: "reports · apps", desc: "Reports, apps, and consumption over governed semantic models.", x: 834, y: 290, w: 152, h: 50, variant: "serve" },
    ],
  },
  {
    slug: "ai-apis", num: 7, label: "AI & APIs",
    desc: "Conversational AI over your estate and programmatic access: data agents, Fabric IQ, GraphQL.",
    header: { x: 58, y: 372 },
    nodes: [
      { slug: "fabric-data-agent", label: "Fabric Data Agent", sub: "grounded conversational AI", desc: "Grounds conversational AI in lakehouses, warehouses, KQL databases, and semantic models.", x: 40, y: 384, w: 206, h: 50, variant: "serve" },
      { slug: "fabric-iq", label: "Fabric IQ", sub: "ontology layer", desc: "The ontology layer that gives data business meaning.", x: 254, y: 384, w: 150, h: 50, variant: "serve" },
      { slug: "graphql-api", label: "API for GraphQL", sub: "app access", desc: "Exposes Fabric data to applications through GraphQL endpoints.", x: 412, y: 384, w: 172, h: 50, variant: "serve" },
    ],
  },
  {
    slug: "storage", num: 2, label: "Storage & OneLake",
    desc: "One logical lake in open Delta-Parquet format over a single copy of data.",
    header: { x: 60, y: 502, size: 15, onBand: true },
    nodes: [
      { slug: "onelake", label: "OneLake", sub: "shortcuts · open format", desc: "The tenant-wide data lake: shortcuts, open format, one copy of data for every engine.", x: 60, y: 536, w: 220, h: 40, variant: "lake" },
      { slug: "lakehouse", label: "Lakehouse", sub: "Delta tables + files", desc: "Delta tables plus files — the engineering-first item over OneLake.", x: 296, y: 536, w: 220, h: 40, variant: "lake" },
      { slug: "mirroring", label: "Mirroring", sub: "near-real-time replication", desc: "Near-real-time replication of external databases into OneLake without pipelines.", x: 532, y: 536, w: 220, h: 40, variant: "lake" },
    ],
  },
];

// Free-standing caption text (not clickable).
const CAPTIONS = [
  { x: 40, y: 40, size: 20, weight: 650, fill: PALETTE.ink, text: "Microsoft Fabric — the whole platform, mapped" },
  { x: 40, y: 61, size: 11.5, fill: PALETTE.faint, text: "Hover a tile to see what it is; click to open its topic. Governance spans everything · OneLake is the foundation · data flows up from storage to BI and AI." },
  { x: 60, y: 523, size: 11, fill: "#D9F5EE", text: "One logical data lake in open Delta-Parquet format — one copy of data, every engine reads and writes it." },
  { x: 1138, y: 560, size: 10.5, fill: "#D9F5EE", anchor: "end", text: "Shortcuts & mirroring bring external data in without copies." },
  { x: 40, y: 632, size: 11, fill: PALETTE.grey, spacing: 1.1, text: "READ BOTTOM-UP: OneLake stores once · engineering & warehousing shape and query · BI & AI serve · platform governs it all." },
  { x: 1160, y: 744, size: 9.5, fill: PALETTE.grey, anchor: "end", text: "Fabric Atlas — original interactive diagram, June 2026. Not a Microsoft asset; palette from the official Fabric icon." },
];

let _styleDone = false;
function ensureStyle() {
  if (_styleDone || typeof document === "undefined") return;
  _styleDone = true;
  const el = document.createElement("style");
  el.textContent = `
    .fa-ig-node { cursor: pointer; }
    .fa-ig-node .card { transition: filter .12s ease, stroke .12s ease, stroke-width .12s ease; }
    .fa-ig-node:hover .card, .fa-ig-node:focus .card { filter: brightness(0.97); stroke: #0B5E50; stroke-width: 2; }
    .fa-ig-node:focus { outline: none; }
    .fa-ig-sec { cursor: pointer; }
    .fa-ig-sec:hover text.sec, .fa-ig-sec:focus text.sec { text-decoration: underline; }
    .fa-ig-sec:focus { outline: none; }
    .fa-ig-tip { pointer-events: none; }
  `;
  document.head.appendChild(el);
}

// Greedy word-wrap into lines no wider than `max` characters.
function wrap(text, max = 38) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= max) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// The hover/focus explanation bubble. Positioned in viewBox units near the anchor
// rect, flipped above/below and clamped horizontally so it never leaves the canvas.
function Tooltip({ anchor }) {
  const lines = wrap(anchor.desc, 40);
  const tw = 300;
  const th = 30 + lines.length * 15;
  const cx = anchor.x + (anchor.w || 220) / 2;
  let tx = Math.max(10, Math.min(cx - tw / 2, VIEW.w - tw - 10));
  let ty = anchor.y - th - 12;
  if (ty < 10) ty = anchor.y + (anchor.h || 24) + 12;   // flip below if no room above
  return (
    <g className="fa-ig-tip">
      <rect x={tx} y={ty} width={tw} height={th} rx="8" fill="#063D3B" opacity="0.96" />
      <text x={tx + 14} y={ty + 22} fontSize="13" fontWeight="700" fill="#FFFFFF">{anchor.label}</text>
      {lines.map((ln, i) => (
        <text key={i} x={tx + 14} y={ty + 40 + i * 15} fontSize="11" fill="#D9F5EE">{ln}</text>
      ))}
    </g>
  );
}

export default function FabricInfographic() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);   // the node or section currently explained
  ensureStyle();

  // One interaction binding for every clickable region: route on click/Enter,
  // and raise the explanation tooltip on hover/focus.
  const bind = (item, slug) => ({
    role: "link", tabIndex: 0,
    onClick: () => navigate(`/topics/${slug}`),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/topics/${slug}`); }
    },
    onMouseEnter: () => setHovered(item),
    onMouseLeave: () => setHovered((h) => (h === item ? null : h)),
    onFocus: () => setHovered(item),
    onBlur: () => setHovered((h) => (h === item ? null : h)),
  });

  const Node = ({ n }) => {
    const p = PALETTE[n.variant || "work"];
    return (
      <g className="fa-ig-node" {...bind(n, n.slug)}>
        <title>{`Open topic: ${n.label}`}</title>
        <rect className="card" x={n.x} y={n.y} width={n.w} height={n.h} rx="7"
          fill={p.fill} stroke={p.stroke} strokeWidth="1.2" />
        <text x={n.x + n.w / 2} y={n.sub ? n.y + n.h / 2 - 4 : n.y + n.h / 2 + 4}
          textAnchor="middle" fontSize="12" fontWeight="600" fill={p.label}>{n.label}</text>
        {n.sub && <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 13} textAnchor="middle"
          fontSize="9.5" fill={p.sub}>{n.sub}</text>}
      </g>
    );
  };

  const SectionHeader = ({ s }) => {
    const h = s.header;
    // anchor the section tooltip to the header text position
    const anchor = { ...s, x: h.x, y: h.y - 14, w: 0, h: 18 };
    return (
      <g className="fa-ig-sec" {...bind(anchor, s.slug)}>
        <title>{`Open section: ${s.label}`}</title>
        <text className="sec" x={h.x} y={h.y} fontSize={h.size || 12.5} fontWeight="700"
          fill={h.onBand ? "#FFFFFF" : PALETTE.grey}>{`${s.num} · ${s.label} →`}</text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} width="100%"
      fontFamily="Segoe UI, -apple-system, sans-serif"
      style={{ display: "block", borderRadius: 6, background: "#FFFFFF", border: "1px solid #E1DFDD" }}
      role="group" aria-label="Interactive Microsoft Fabric map — hover a component to read about it, click to open its topic">
      <defs>
        <linearGradient id="ig-lake" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0B5E50" /><stop offset="0.55" stopColor="#117865" /><stop offset="1" stopColor="#2AAC94" />
        </linearGradient>
        <linearGradient id="ig-plat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0E6961" /><stop offset="1" stopColor="#1E8C78" />
        </linearGradient>
        <marker id="ig-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#2AAC94" />
        </marker>
      </defs>

      {BANDS.map((b, i) => (
        <rect key={`band-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.rx} fill={`url(#${b.gradient})`} />
      ))}

      {ARROWS.map((a, i) => (
        <line key={`arr-${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
          stroke={a.color} strokeWidth="1.7" markerEnd="url(#ig-arr)" />
      ))}

      {CAPTIONS.map((t, i) => (
        <text key={`cap-${i}`} x={t.x} y={t.y} fontSize={t.size} fontWeight={t.weight || 400}
          fill={t.fill} textAnchor={t.anchor || "start"} letterSpacing={t.spacing || 0}>{t.text}</text>
      ))}

      {SECTIONS.map((s) => (
        <React.Fragment key={s.slug}>
          <SectionHeader s={s} />
          {s.nodes.map((n) => <Node key={n.slug} n={n} />)}
        </React.Fragment>
      ))}

      {/* drawn last so it sits above every tile */}
      {hovered && hovered.desc && <Tooltip anchor={hovered} />}
    </svg>
  );
}
