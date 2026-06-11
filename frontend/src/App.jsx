import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { c, BRAND, sans, mono, applyTheme, initialTheme } from "./theme.js";

/* ------------------------------------------------------------------ *
 * Fabric Atlas — frontend for the local backend (http://localhost:8000,
 * proxied by Vite). Read/verify/inspect UI for the knowledge base.
 * Authoring (ingest, design, diagrams, lessons) happens in the IDE via
 * the Claude Code / Codex agents — see the Author tab.
 *
 * Themed to the Microsoft Fabric design language — tokens in theme.js.
 * ------------------------------------------------------------------ */

const CAPABILITIES = [
  { id: "fabric-platform", name: "Microsoft Fabric", area: "Platform" },
  { id: "onelake", name: "OneLake", area: "Storage" },
  { id: "lakehouse", name: "Lakehouse", area: "Storage" },
  { id: "warehouse", name: "Warehouse", area: "Warehouse" },
  { id: "polaris", name: "Polaris / SQL Engine", area: "Warehouse" },
  { id: "direct-lake", name: "Direct Lake", area: "BI & Semantic" },
  { id: "semantic-model", name: "Semantic Model", area: "BI & Semantic" },
  { id: "power-bi", name: "Power BI", area: "BI & Semantic" },
  { id: "data-factory", name: "Data Factory", area: "Integration" },
  { id: "dataflow-gen2", name: "Dataflow Gen2", area: "Integration" },
  { id: "spark", name: "Spark / Data Engineering", area: "Engineering" },
  { id: "rti", name: "Real-Time Intelligence", area: "Real-Time" },
  { id: "eventhouse-kql", name: "Eventhouse / KQL", area: "Real-Time" },
  { id: "sql-database", name: "SQL Database in Fabric", area: "Databases" },
  { id: "mirroring", name: "Mirroring", area: "Databases" },
  { id: "fabric-data-agent", name: "Fabric Data Agent", area: "AI & Agents" },
  { id: "fabric-iq", name: "Fabric IQ / Ontology", area: "AI & Agents" },
  { id: "graphql-api", name: "API for GraphQL", area: "APIs" },
  { id: "purview", name: "Governance / Purview", area: "Governance" },
  { id: "capacity", name: "Capacity & Cost", area: "Platform Ops" },
];
const DEPTHS = [
  { n: 1, short: "L1", label: "Conceptual" }, { n: 2, short: "L2", label: "Practitioner" },
  { n: 3, short: "L3", label: "Architect" }, { n: 4, short: "L4", label: "Performance" },
  { n: 5, short: "L5", label: "Internals" },
];
const TIER_COLORS = { 1: c.tier1, 2: c.tier2, 3: c.tier3, 4: c.tier4, 5: c.tier5, 6: c.tier6 };
const TIER_LABELS = {
  1: "Microsoft Learn", 2: "Fabric product blog", 3: "Microsoft GitHub / papers",
  4: "MVP / community", 5: "Vendor", 6: "Unknown",
};
const SEV_COLORS = { critical: c.red, warning: c.amber, info: c.muted };

/* ------------------------------- api ------------------------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json();
}

/* ----------------------------- markdown ---------------------------- */
/* Full GFM rendering (tables, code, links, nested lists) via react-markdown,
   themed with the same tokens as the rest of the UI. [Sn] citations anywhere
   in text are rendered as chips. */
const CiteChip = ({ tag }) => (
  <span style={{ fontFamily: mono, fontSize: 11, color: c.accentText, background: c.accentSoft, border: "1px solid " + c.accentDim, borderRadius: 4, padding: "0 4px", margin: "0 1px" }}>{tag}</span>
);

function cite(children) {
  return React.Children.map(children, (child) =>
    typeof child === "string"
      ? child.split(/(\[S\d+\])/g).map((p, i) =>
          /^\[S\d+\]$/.test(p) ? <CiteChip key={i} tag={p.slice(1, -1)} /> : p)
      : child
  );
}

const heading = (size, upper = false) => ({ children }) => (
  <div style={{ color: c.accentText, fontFamily: sans, fontWeight: 600, fontSize: size, letterSpacing: upper ? 0.3 : 0, textTransform: upper ? "uppercase" : "none", margin: "18px 0 6px" }}>{cite(children)}</div>
);

const mdComponents = {
  h1: heading(16), h2: heading(13, true), h3: heading(13, true),
  h4: heading(12.5, true), h5: heading(12.5, true), h6: heading(12.5, true),
  p: ({ children }) => <p style={{ color: c.text, lineHeight: 1.6, margin: "6px 0" }}>{cite(children)}</p>,
  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ol>,
  li: ({ children }) => <li style={{ color: c.text, lineHeight: 1.55, marginBottom: 4 }}>{cite(children)}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: c.accentText, textDecorationColor: c.accentDim }}>{children}</a>
  ),
  code: ({ children }) => (
    <code style={{ fontFamily: mono, fontSize: 12, color: c.accentText, background: c.accentSoft, borderRadius: 4, padding: "1px 5px" }}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre style={{ fontFamily: mono, fontSize: 12, color: c.text, background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: "10px 12px", overflowX: "auto", lineHeight: 1.5 }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ margin: "8px 0", padding: "2px 14px", borderLeft: "3px solid " + c.accentDim, color: c.muted }}>{children}</blockquote>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "10px 0" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "2px solid " + c.line, color: c.accentText, fontWeight: 600 }}>{cite(children)}</th>,
  td: ({ children }) => <td style={{ padding: "6px 10px", borderBottom: "1px solid " + c.lineSoft, verticalAlign: "top", color: c.text }}>{cite(children)}</td>,
  hr: () => <hr style={{ border: "none", borderTop: "1px solid " + c.line, margin: "14px 0" }} />,
};

function Md({ text }) {
  if (!text) return null;
  return (
    <div style={{ fontSize: 13 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>
    </div>
  );
}

/* ---------------------------- small ui ----------------------------- */
const Chip = ({ children, color = c.muted, bg = "transparent" }) => (
  <span style={{ fontFamily: mono, fontSize: 11, color, background: bg, border: "1px solid " + (bg === "transparent" ? c.line : "transparent"), borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{children}</span>
);
const Btn = ({ children, onClick, primary, small, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ fontFamily: sans, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, color: primary ? c.onAccent : c.text, background: primary ? c.accent : c.panel, border: "1px solid " + (primary ? c.accent : c.line), borderRadius: 4, padding: small ? "5px 12px" : "8px 16px", boxShadow: c.shadow }}>{children}</button>
);
const Empty = ({ children }) => (
  <div style={{ border: "1px dashed " + c.line, borderRadius: 8, padding: 24, textAlign: "center", color: c.muted, fontSize: 13, lineHeight: 1.6, background: c.panel }}>{children}</div>
);
const Code = ({ children }) => (
  <code style={{ fontFamily: mono, fontSize: 12, color: c.accentText, background: c.accentSoft, borderRadius: 4, padding: "1px 5px" }}>{children}</code>
);

const capName = (id) => CAPABILITIES.find((x) => x.id === id)?.name || id;
const isCommunitySource = (s) => s?.tier === 4 || /bradcoles|milescole|blog/i.test(s?.url || "");
const sourceUrl = (assetPath) => "/" + (assetPath || "").replace(/^\//, "");

const claimStatusChip = (cl) => (
  cl.status === "verified" ? <Chip color={c.green}>verified</Chip>
    : cl.status === "pending" ? <Chip color={c.amber}>pending</Chip>
    : <Chip color={c.faint}>{cl.status}</Chip>
);

function ClaimRows({ claims, compact = false }) {
  if (!claims.length) return <div style={{ color: c.muted, fontSize: 13 }}>No claims.</div>;
  return (
    <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
      {claims.map((cl) => (
        <div key={cl.id} style={{ border: "1px solid " + c.lineSoft, borderRadius: 6, background: c.panel2, padding: compact ? 8 : 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
            <Chip color={c.accentText}>{capName(cl.capability_id)}</Chip>
            <Chip color={c.accentText}>L{cl.depth}</Chip>
            <Chip>{cl.type}</Chip>
            {claimStatusChip(cl)}
          </div>
          <div style={{ fontSize: compact ? 12.5 : 13, lineHeight: 1.55 }}>{cl.text}</div>
        </div>
      ))}
    </div>
  );
}

function claimsForAsset(asset, claims, sourceClaims = []) {
  const activeClaims = claims.filter((cl) => cl.active !== false);
  const activeSourceClaims = sourceClaims.filter((cl) => cl.active !== false);
  if (asset.claim_id) return activeClaims.filter((cl) => cl.id === asset.claim_id);
  if (asset.source_id) return activeSourceClaims.length ? activeSourceClaims : activeClaims.filter((cl) => cl.source_id === asset.source_id);
  if (asset.capability_id) return activeClaims.filter((cl) => cl.capability_id === asset.capability_id);
  return [];
}

function DiagramPanel({ asset, claims, sources, sourceClaims = [], onClose, onOpenSource, onOpenCapability }) {
  if (!asset) return null;
  const relatedClaims = claimsForAsset(asset, claims, sourceClaims);
  const sourceIds = [...new Set(relatedClaims.map((cl) => cl.source_id).concat(asset.source_id ? [asset.source_id] : []))].filter(Boolean);
  const relatedSources = sourceIds.map((id) => sources.find((s) => s.id === id)).filter(Boolean);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 20, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: "min(560px, 94vw)", height: "100%", background: c.panel, borderLeft: "1px solid " + c.line, boxShadow: c.shadow, padding: 18, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 15 }}>Diagram drill-through</div>
            {asset.capability_id && <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{capName(asset.capability_id)}</div>}
          </div>
          <Btn small onClick={onClose}>Close</Btn>
        </div>
        {asset.path && (
          <img src={sourceUrl(asset.path)} alt={asset.caption}
            style={{ width: "100%", borderRadius: 6, background: c.diagramBg, border: "1px solid " + c.lineSoft, marginBottom: 10 }} />
        )}
        <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>{asset.caption || "Original generated diagram."}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <Chip color={c.green}>original diagram</Chip>
          {asset.capability_id && (
            <Btn small onClick={() => onOpenCapability?.(asset.capability_id)}>Open capability</Btn>
          )}
        </div>
        {relatedSources.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>RELATED SOURCES</div>
            <div style={{ display: "grid", gap: 6 }}>
              {relatedSources.map((s) => (
                <button key={s.id} onClick={() => onOpenSource?.(s.id)} style={{ textAlign: "left", cursor: "pointer", background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 9 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{s.title}</span>
                  <span style={{ marginLeft: 8 }}><Chip color={TIER_COLORS[s.tier]}>T{s.tier}</Chip></span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>RELATED CLAIMS</div>
        <ClaimRows claims={relatedClaims.slice(0, 12)} compact />
      </div>
    </div>
  );
}

function DiagramThumb({ asset, onClick }) {
  if (asset.kind !== "generated" || !asset.path) return null;
  return (
    <button onClick={onClick} style={{ textAlign: "left", cursor: "pointer", border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 8, background: c.panel2, maxWidth: 360 }}>
      <img src={sourceUrl(asset.path)} alt={asset.caption} style={{ width: "100%", borderRadius: 4, background: c.diagramBg, display: "block" }} />
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6, flexWrap: "wrap" }}>
        <Chip color={c.green}>diagram</Chip>
        <span style={{ fontSize: 12, color: c.text }}>{asset.caption}</span>
      </div>
    </button>
  );
}

/* Original Fabric Atlas mark — woven layers in the Fabric brand ramp.
   Deliberately NOT Microsoft's Fabric icon: Microsoft's icon terms do not
   allow product icons to represent third-party apps, so this is our own
   geometry using the same palette. */
const AtlasMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Fabric Atlas" role="img">
    <defs>
      <linearGradient id="fa-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.pine} />
        <stop offset="0.55" stopColor={BRAND.teal} />
        <stop offset="1" stopColor={BRAND.jade} />
      </linearGradient>
      <linearGradient id="fa-g2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.jade} />
        <stop offset="1" stopColor={BRAND.mint} />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#fa-g1)" />
    <path d="M7 21.5 16 17l9 4.5L16 26z" fill={BRAND.ink} opacity="0.55" />
    <path d="M7 16.5 16 12l9 4.5L16 21z" fill="url(#fa-g2)" opacity="0.9" />
    <path d="M7 11.5 16 7l9 4.5L16 16z" fill="#E9FFF8" opacity="0.95" />
  </svg>
);

/* ================================ app =============================== */
export default function App() {
  const [tab, setTab] = useState("overview");
  const [health, setHealth] = useState("checking");
  const [theme, setTheme] = useState(initialTheme);
  const [registryCap, setRegistryCap] = useState(null); // deep-link from Overview

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    api("/health").then(() => setHealth("ok")).catch(() => setHealth("down"));
  }, []);

  const openCapability = (id) => { setRegistryCap(id); setTab("registry"); };

  const tabs = [
    ["overview", "Overview"], ["registry", "Registry"], ["sources", "Sources"],
    ["designs", "Designs"], ["learn", "Learn"], ["author", "Author"],
  ];

  return (
    <div style={{ fontFamily: sans, background: c.bg, color: c.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px" }}>
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid " + c.line, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <AtlasMark />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>
                Fabric Atlas
                <span style={{ fontWeight: 400, color: c.muted, fontSize: 13, marginLeft: 8 }}>for Microsoft Fabric</span>
              </div>
              <div style={{ color: c.muted, fontSize: 12 }}>Governed knowledge → grounded architecture</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Chip color={health === "ok" ? c.green : health === "down" ? c.red : c.muted}>
              backend {health === "ok" ? "● connected" : health === "down" ? "● unreachable — run uvicorn" : "…"}
            </Chip>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={"Switch to " + (theme === "light" ? "dark" : "light") + " theme"}
              style={{ cursor: "pointer", background: c.panel, color: c.muted, border: "1px solid " + c.line, borderRadius: 4, padding: "4px 10px", fontFamily: sans, fontSize: 12 }}>
              {theme === "light" ? "◑ Dark" : "◐ Light"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid " + c.line, overflowX: "auto" }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ fontFamily: sans, fontSize: 13, fontWeight: tab === id ? 600 : 500, cursor: "pointer", background: "transparent", border: "none", color: tab === id ? c.text : c.muted, borderBottom: "2.5px solid " + (tab === id ? c.accent : "transparent"), padding: "12px 14px", marginBottom: -1, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
        <div style={{ padding: "20px 0 60px" }}>
          {health === "down" ? (
            <>
              {tab === "overview" && <Overview offline onOpenCapability={openCapability} />}
              <Empty>
                Backend is not running. Start it first:<br />
                <Code>cd backend &amp;&amp; .venv\Scripts\activate &amp;&amp; uvicorn app.main:app --reload</Code>
              </Empty>
            </>
          ) : tab === "overview" ? <Overview onOpenCapability={openCapability} />
            : tab === "registry" ? <Registry initialCap={registryCap} onConsumedInitial={() => setRegistryCap(null)} />
            : tab === "sources" ? <Sources onOpenCapability={openCapability} />
            : tab === "designs" ? <Designs />
            : tab === "learn" ? <Learn onOpenCapability={openCapability} />
            : <Author />}
        </div>
      </div>
    </div>
  );
}

/* ============================== overview ============================ */
/* The overarching Microsoft Fabric view: what the platform is, how the
   pieces fit, and what this atlas knows about it. The narrative copy here
   is orientation text (our own words); everything specific lives in the
   cited, versioned claims below it. */

const FABRIC_STORY = [
  {
    title: "One platform, one lake",
    body: "Microsoft Fabric is a SaaS analytics platform that bundles the whole data estate — integration, engineering, warehousing, real-time, BI, and AI — into one product. Every workload reads and writes the same store: OneLake, a single logical data lake in open Delta-Parquet format. Data lands once and every engine works over that one copy.",
    caps: ["fabric-platform", "onelake"],
  },
  {
    title: "Workloads, not services",
    body: "Instead of stitching together separate services, Fabric exposes experiences over shared items: pipelines and dataflows move data in, Spark notebooks and the Warehouse shape it, Eventhouses handle streams, and semantic models serve it to Power BI. Mirroring and shortcuts bring external data in without copy jobs.",
    caps: ["data-factory", "spark", "warehouse", "eventhouse-kql", "mirroring"],
  },
  {
    title: "Compute as a currency",
    body: "A Fabric capacity is one pool of compute, denominated in capacity units, that all workloads draw from. Smoothing and bursting average the spend over time, which changes how you reason about sizing and cost compared with per-service pricing.",
    caps: ["capacity"],
  },
  {
    title: "Governed by design",
    body: "Workspaces, domains, endorsement, sensitivity labels, and the Purview hub form the governance layer. The same ideas drive this atlas: every claim is cited, trust-tiered, versioned, and human-approved before anything downstream may rely on it.",
    caps: ["purview"],
  },
  {
    title: "BI without copies",
    body: "Direct Lake is the signature trick: Power BI semantic models load column data straight from Delta tables in OneLake — no scheduled import, no DirectQuery round trip in the common path. The whole platform design funnels into making that fast.",
    caps: ["direct-lake", "semantic-model", "power-bi"],
  },
  {
    title: "AI over your estate",
    body: "Data agents ground conversational AI in lakehouses, warehouses, KQL databases, and semantic models, while Fabric IQ adds an ontology layer that gives data business meaning. Both depend on the governed, well-modelled foundation the rest of the platform provides.",
    caps: ["fabric-data-agent", "fabric-iq"],
  },
];

function Overview({ onOpenCapability, offline = false }) {
  const [coverage, setCoverage] = useState({});
  const [sources, setSources] = useState([]);
  const [claims, setClaims] = useState([]);
  const [diagram, setDiagram] = useState("/content/diagrams/fabric-platform-overview.svg");

  useEffect(() => {
    if (offline) return;
    api("/coverage").then(setCoverage).catch(() => {});
    api("/sources").then(setSources).catch(() => {});
    api("/claims?capability=fabric-platform").then(setClaims).catch(() => {});
    api("/assets?capability=fabric-platform").then((as) => {
      const gen = as.find((a) => a.kind === "generated" && a.path);
      if (gen) setDiagram("/" + gen.path.replace(/^\//, ""));
    }).catch(() => {});
  }, [offline]);

  const totalClaims = Object.values(coverage).reduce((a, g) => a + Object.values(g).reduce((x, y) => x + y, 0), 0);
  const coveredCaps = Object.keys(coverage).filter((k) => Object.values(coverage[k]).some((n) => n > 0)).length;
  const activeSources = sources.filter((s) => s.active).length;

  return (
    <div>
      {/* hero */}
      <div style={{ borderRadius: 10, padding: "26px 28px", color: "#E9FFF8", marginBottom: 18, background: `linear-gradient(110deg, ${c.heroFrom} 0%, ${c.heroVia} 55%, ${c.heroTo} 100%)`, boxShadow: c.shadow }}>
        <div style={{ fontSize: 12, fontFamily: mono, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.75, marginBottom: 6 }}>The big picture</div>
        <div style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.2, maxWidth: 720 }}>
          Microsoft Fabric, mapped: every capability, source-graded and versioned.
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.65, maxWidth: 760, marginTop: 10, opacity: 0.92 }}>
          Fabric Atlas is a governed knowledge base over the Microsoft Fabric platform. Approved
          sources become atomic, cited claims; claims power architectures and lessons; everything
          generated is validated against what it cites. This page is the overarching view —
          start here, then drill into a capability.
        </div>
        {!offline && (
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            {[[totalClaims, "claims"], [coveredCaps + "/" + CAPABILITIES.length, "capabilities covered"], [activeSources, "active sources"]].map(([n, l]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, padding: "6px 14px" }}>
                <span style={{ fontSize: 18, fontWeight: 650 }}>{n}</span>
                <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 7 }}>{l}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* platform diagram — original, authored in-repo */}
      <div style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, padding: 18, marginBottom: 18, boxShadow: c.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>The platform at a glance</span>
          <Chip color={c.green}>original diagram</Chip>
        </div>
        <img src={diagram} alt="Microsoft Fabric platform overview — workloads over OneLake, governed by Purview, metered by capacities"
          style={{ width: "100%", borderRadius: 6, background: c.diagramBg, border: "1px solid " + c.lineSoft }}
          onError={(e) => { e.target.closest("div").style.display = "none"; }} />
      </div>

      {/* how it fits together */}
      <div style={{ fontWeight: 600, fontSize: 14, margin: "4px 0 4px" }}>How it fits together</div>
      <div style={{ color: c.faint, fontSize: 12, marginBottom: 10 }}>
        Orientation text, written for this atlas — specifics live in the cited claims per capability.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12, marginBottom: 22 }}>
        {FABRIC_STORY.map((s) => (
          <div key={s.title} style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, padding: "14px 16px", boxShadow: c.shadow }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6, color: c.accentText }}>{s.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: c.text }}>{s.body}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {s.caps.map((id) => {
                const cap = CAPABILITIES.find((x) => x.id === id);
                if (!cap) return null;
                return (
                  <button key={id} onClick={() => onOpenCapability(id)} style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: c.accentText, background: c.accentSoft, border: "1px solid " + c.accentDim, borderRadius: 12, padding: "2px 9px" }}>
                    {cap.name} →
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* platform-level claims */}
      {!offline && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, boxShadow: c.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid " + c.line, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>What the atlas asserts about the platform</span>
            <Btn small onClick={() => onOpenCapability("fabric-platform")}>Open in Registry</Btn>
          </div>
          {claims.length === 0 ? (
            <div style={{ padding: 16, color: c.muted, fontSize: 13 }}>
              No platform-level claims yet — ingest an overview source, e.g.{" "}
              <Code>/ingest https://learn.microsoft.com/fabric/fundamentals/microsoft-fabric-overview tier=1</Code>,
              then publish with <Code>python scripts/import_content.py</Code>.
            </div>
          ) : (
            DEPTHS.map((d) => {
              const rows = claims.filter((cl) => cl.depth === d.n);
              if (!rows.length) return null;
              return (
                <div key={d.n} style={{ borderBottom: "1px solid " + c.lineSoft }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, padding: "10px 16px 0", textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {d.short} · {d.label}
                  </div>
                  {rows.map((cl) => (
                    <div key={cl.id} style={{ padding: "9px 16px", display: "flex", gap: 10, alignItems: "baseline" }}>
                      {cl.status === "verified" ? <Chip color={c.green}>✓</Chip> : <Chip color={c.amber}>pending</Chip>}
                      <span style={{ fontSize: 13, lineHeight: 1.55 }}>{cl.text}</span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ============================== registry ============================ */
function Registry({ initialCap = null, onConsumedInitial = () => {} }) {
  const [coverage, setCoverage] = useState({});
  const [claims, setClaims] = useState([]);
  const [tags, setTags] = useState({});
  const [cap, setCap] = useState(initialCap);
  const [tagFilter, setTagFilter] = useState("");
  const [history, setHistory] = useState(null);
  const [capAssets, setCapAssets] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => { if (initialCap) onConsumedInitial(); }, [initialCap, onConsumedInitial]);
  useEffect(() => {
    if (!cap) { setCapAssets([]); return; }
    api("/assets?capability=" + cap).then(setCapAssets).catch(() => setCapAssets([]));
  }, [cap]);

  const refresh = useCallback(() => {
    api("/coverage").then(setCoverage).catch((e) => setErr(e.message));
    api("/tags").then(setTags).catch(() => {});
    const q = new URLSearchParams();
    if (cap) q.set("capability", cap);
    if (tagFilter) q.set("tag", tagFilter);
    api("/claims?" + q.toString()).then(setClaims).catch((e) => setErr(e.message));
  }, [cap, tagFilter]);
  useEffect(() => { refresh(); }, [refresh]);

  const verify = async (id) => {
    try { await api(`/claims/${id}/verify`, { method: "POST" }); } catch (e) { setErr(e.message); }
    refresh();
  };
  const pendingShown = claims.filter((cl) => cl.status === "pending");
  const verifyAllShown = async () => {
    try {
      await api("/claims/verify-bulk", { method: "POST", body: JSON.stringify({ claim_ids: pendingShown.map((cl) => cl.id) }) });
    } catch (e) { setErr(e.message); }
    refresh();
  };
  const total = Object.values(coverage).reduce((a, g) => a + Object.values(g).reduce((x, y) => x + y, 0), 0);
  const areas = [...new Set(CAPABILITIES.map((x) => x.area))];

  return (
    <div>
      {err && <div style={{ color: c.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {total === 0 && (
        <Empty>
          The knowledge base is empty. Author content with the agents, then publish:<br />
          <Code>python scripts/import_content.py</Code>
        </Empty>
      )}

      {Object.keys(tags).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 16px", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: c.faint }}>TAGS</span>
          {Object.entries(tags).map(([t, n]) => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? "" : t)} style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: tagFilter === t ? c.onAccent : c.accentText, background: tagFilter === t ? c.accent : c.accentSoft, border: "1px solid " + (tagFilter === t ? c.accent : c.accentDim), borderRadius: 12, padding: "2px 9px" }}>#{t} <span style={{ opacity: 0.7 }}>{n}</span></button>
          ))}
        </div>
      )}

      {areas.map((area) => (
        <div key={area} style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{area}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {CAPABILITIES.filter((x) => x.area === area).map((x) => {
              const g = coverage[x.id] || {};
              const n = Object.values(g).reduce((a, b) => a + b, 0);
              return (
                <button key={x.id} onClick={() => setCap(cap === x.id ? null : x.id)} style={{ textAlign: "left", cursor: "pointer", background: cap === x.id ? c.accentSoft : c.panel, border: "1px solid " + (cap === x.id ? c.accent : c.line), borderRadius: 8, padding: "11px 12px", boxShadow: c.shadow }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{x.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: n ? c.accentText : c.faint }}>{n}</span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {DEPTHS.map((d) => {
                      const k = g[d.n] || g[String(d.n)] || 0;
                      return (
                        <div key={d.n} style={{ flex: 1 }} title={`${d.short} ${d.label}: ${k}`}>
                          <div style={{ height: 5, borderRadius: 2, background: k ? c.accent : c.lineSoft, opacity: k ? Math.min(0.4 + k * 0.2, 1) : 1 }} />
                          <div style={{ fontFamily: mono, fontSize: 8, color: k ? c.muted : c.faint, textAlign: "center", marginTop: 2 }}>{d.short}</div>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {(cap || tagFilter) && (
        <div style={{ marginTop: 18, border: "1px solid " + c.accentDim, borderRadius: 8, background: c.panel, boxShadow: c.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid " + c.line }}>
            <span style={{ fontWeight: 600 }}>
              {cap ? CAPABILITIES.find((x) => x.id === cap)?.name : "All capabilities"}
              {tagFilter && <span style={{ color: c.accentText }}> · #{tagFilter}</span>}
              <span style={{ color: c.muted, fontWeight: 400, fontSize: 13 }}> · {claims.length} claims</span>
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {pendingShown.length > 1 && (
                <Btn small primary onClick={verifyAllShown}>Verify all pending ({pendingShown.length})</Btn>
              )}
              <button onClick={() => { setCap(null); setTagFilter(""); }} style={{ background: "transparent", border: "none", color: c.muted, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          </div>
          {capAssets.filter((a) => a.kind === "generated" && a.path).map((a) => (
            <div key={a.id} style={{ padding: "12px 14px", borderBottom: "1px solid " + c.lineSoft }}>
              <img src={"/" + a.path.replace(/^\//, "")} alt={a.caption}
                style={{ width: "100%", borderRadius: 6, background: c.diagramBg, border: "1px solid " + c.lineSoft }}
                onError={(e) => { e.target.closest("div").style.display = "none"; }} />
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 6 }}>
                <Chip color={c.green}>original diagram</Chip>
                <span style={{ fontSize: 12, color: c.muted }}>{a.caption}</span>
              </div>
            </div>
          ))}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {claims.length === 0 && <div style={{ padding: 16, color: c.muted, fontSize: 13 }}>No claims match.</div>}
            {claims.map((cl) => (
              <div key={cl.id} style={{ padding: "11px 14px", borderBottom: "1px solid " + c.lineSoft }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <Chip color={c.accentText}>L{cl.depth}</Chip>
                  <Chip>{cl.type}</Chip>
                  <Chip color={c.faint}>v{cl.version}</Chip>
                  {cl.status === "verified" ? <Chip color={c.green}>✓ verified</Chip>
                    : cl.status === "pending" ? <Chip color={c.amber}>pending</Chip>
                    : <Chip color={c.faint}>{cl.status}</Chip>}
                  {(cl.tags || []).map((t) => <Chip key={t} color={c.accentText}>#{t}</Chip>)}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55 }}>{cl.text}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 7, justifyContent: "flex-end" }}>
                  {cl.status === "pending" && <Btn small primary onClick={() => verify(cl.id)}>Verify</Btn>}
                  <Btn small onClick={async () => setHistory(await api(`/claims/${cl.claim_key}/history`))}>History</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history && (
        <div style={{ marginTop: 14, border: "1px solid " + c.line, borderRadius: 8, background: c.panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid " + c.line }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Version chain</span>
            <button onClick={() => setHistory(null)} style={{ background: "transparent", border: "none", color: c.muted, cursor: "pointer" }}>×</button>
          </div>
          {history.map((h) => (
            <div key={h.id} style={{ padding: "10px 14px", borderBottom: "1px solid " + c.lineSoft, opacity: h.active ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <Chip color={h.active ? c.green : c.faint}>v{h.version}</Chip>
                <Chip>{h.status}</Chip>
              </div>
              <div style={{ fontSize: 13 }}>{h.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== sources ============================= */
function Sources({ onOpenCapability }) {
  const [sources, setSources] = useState([]);
  const [assets, setAssets] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [claimsBySource, setClaimsBySource] = useState({});
  const [pendingBySource, setPendingBySource] = useState({});
  const [openSourceId, setOpenSourceId] = useState(null);
  const [openDiagram, setOpenDiagram] = useState(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [communityOnly, setCommunityOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [err, setErr] = useState("");
  const refresh = useCallback(() => {
    api("/sources").then(setSources).catch((e) => setErr(e.message));
    api("/assets").then(setAssets).catch(() => {});
    api("/claims?include_inactive=true").then((rows) => {
      const by = {};
      rows.forEach((cl) => { (by[cl.source_id] ||= []).push(cl); });
      setAllClaims(rows);
      setClaimsBySource(by);
    }).catch(() => {});
    api("/claims?status=pending").then((rows) => {
      const by = {};
      rows.forEach((cl) => { by[cl.source_id] = (by[cl.source_id] || 0) + 1; });
      setPendingBySource(by);
    }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const verifySource = async (id) => {
    try {
      await api("/claims/verify-bulk", { method: "POST", body: JSON.stringify({ source_id: id }) });
    } catch (e) { setErr(e.message); }
    refresh();
  };
  if (err) return <div style={{ color: c.red, fontSize: 13 }}>{err}</div>;
  if (!sources.length) return <Empty>No sources yet. Run <Code>/ingest &lt;url&gt;</Code> in Claude Code, then publish.</Empty>;

  const q = query.trim().toLowerCase();
  const claimMatches = (cl) =>
    !q || cl.text.toLowerCase().includes(q) ||
    (cl.tags || []).some((t) => t.toLowerCase().includes(q)) ||
    cl.capability_id.toLowerCase().includes(q);
  const sourceMatches = (s) => {
    const sc = claimsBySource[s.id] || [];
    return !q ||
      (s.title || "").toLowerCase().includes(q) ||
      (s.url || "").toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      sc.some(claimMatches);
  };
  const filtered = sources.filter((s) =>
    (!activeOnly || s.active) &&
    (tierFilter === "all" || String(s.tier) === tierFilter) &&
    (!communityOnly || isCommunitySource(s)) &&
    sourceMatches(s)
  );
  const activeCount = sources.filter((s) => s.active).length;
  const communityCount = sources.filter((s) => s.active && isCommunitySource(s)).length;
  const visibleClaimCount = filtered.reduce((n, s) => n + (claimsBySource[s.id] || []).length, 0);
  const openSource = sources.find((s) => s.id === openSourceId) || filtered[0];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 12, boxShadow: c.shadow }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <Chip color={c.accentText}>{activeCount} active sources</Chip>
          <Chip color={c.accentText}>{communityCount} community blogs</Chip>
          <Chip>{visibleClaimCount} visible claims</Chip>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources and claims"
            style={{ flex: "1 1 260px", fontFamily: sans, fontSize: 13, color: c.text, background: c.panel2, border: "1px solid " + c.line, borderRadius: 4, padding: "8px 10px", minWidth: 0 }}
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            style={{ flex: "0 1 190px", fontFamily: sans, fontSize: 13, color: c.text, background: c.panel2, border: "1px solid " + c.line, borderRadius: 4, padding: "8px 10px", minWidth: 150 }}>
            <option value="all">All tiers</option>
            {[1, 2, 3, 4, 5, 6].map((t) => <option key={t} value={String(t)}>T{t} · {TIER_LABELS[t]}</option>)}
          </select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: c.muted, fontSize: 12, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={communityOnly} onChange={(e) => setCommunityOnly(e.target.checked)} />
            Community blogs
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: c.muted, fontSize: 12, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
        </div>
      </div>

      {!filtered.length && <Empty>No sources match the current filters.</Empty>}

      {filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8, maxHeight: 760, overflowY: "auto" }}>
            {filtered.map((s) => {
              const sc = claimsBySource[s.id] || [];
              const pending = pendingBySource[s.id] || 0;
              const verified = sc.filter((cl) => cl.status === "verified").length;
              return (
                <button key={s.id} onClick={() => setOpenSourceId(s.id)}
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid " + (openSource?.id === s.id ? c.accent : c.line), borderRadius: 8, background: openSource?.id === s.id ? c.accentSoft : c.panel, padding: 12, boxShadow: c.shadow }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                    <Chip color={TIER_COLORS[s.tier]}>T{s.tier}</Chip>
                    {isCommunitySource(s) && <Chip color={c.accentText}>community blog</Chip>}
                    {!s.active && <Chip color={c.faint}>superseded</Chip>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: c.text, lineHeight: 1.35 }}>{s.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <Chip color={sc.length ? c.accentText : c.faint}>{sc.length} claims</Chip>
                    <Chip color={verified ? c.green : c.faint}>{verified} verified</Chip>
                    {pending > 0 && <Chip color={c.amber}>{pending} pending</Chip>}
                  </div>
                </button>
              );
            })}
          </div>
          <SourceReader
            source={openSource}
            claims={claimsBySource[openSource?.id] || []}
            allClaims={allClaims}
            sources={sources}
            assets={assets}
            onVerifySource={verifySource}
            onOpenDiagram={setOpenDiagram}
            onOpenCapability={onOpenCapability}
          />
        </div>
      )}
      <DiagramPanel
        asset={openDiagram}
        claims={allClaims}
        sources={sources}
        sourceClaims={claimsBySource[openDiagram?.source_id] || []}
        onClose={() => setOpenDiagram(null)}
        onOpenSource={setOpenSourceId}
        onOpenCapability={onOpenCapability}
      />
    </div>
  );
}

function SourceReader({ source, claims, allClaims, sources, assets, onVerifySource, onOpenDiagram, onOpenCapability }) {
  if (!source) return null;
  const pending = claims.filter((cl) => cl.status === "pending");
  const verified = claims.filter((cl) => cl.status === "verified");
  const capabilityIds = [...new Set(claims.map((cl) => cl.capability_id))];
  const sourceAssets = assets.filter((a) => a.source_id === source.id);
  const capabilityDiagrams = assets.filter((a) => a.kind === "generated" && a.path && !a.source_id && !a.design_id && capabilityIds.includes(a.capability_id));
  const diagrams = [...sourceAssets.filter((a) => a.kind === "generated" && a.path), ...capabilityDiagrams]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);
  const referenced = sourceAssets.filter((a) => a.kind === "referenced");
  const grouped = capabilityIds.map((id) => [id, claims.filter((cl) => cl.capability_id === id)]);
  return (
    <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, boxShadow: c.shadow, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid " + c.line }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Chip color={TIER_COLORS[source.tier]}>{`T${source.tier} · ${TIER_LABELS[source.tier] || ""}`}</Chip>
          {isCommunitySource(source) && <Chip color={c.accentText}>community blog</Chip>}
          <Chip color={source.active ? c.green : c.faint}>{source.active ? "active" : "superseded"}</Chip>
          <Chip color={c.faint}>v{source.version}</Chip>
        </div>
        <div style={{ fontSize: 19, fontWeight: 650, lineHeight: 1.25 }}>{source.title}</div>
        {source.url && <a href={source.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 7, fontFamily: mono, fontSize: 11, color: c.accentText, textDecorationColor: c.accentDim }}>Open original source</a>}
      </div>
      <div style={{ padding: 16, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <div style={{ background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 10 }}><Chip color={c.accentText}>{claims.length} extracted claims</Chip></div>
          <div style={{ background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 10 }}><Chip color={c.green}>{verified.length} verified</Chip></div>
          <div style={{ background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 10 }}><Chip color={pending.length ? c.amber : c.faint}>{pending.length} pending</Chip></div>
        </div>
        {pending.length > 0 && <Btn small primary onClick={() => onVerifySource(source.id)}>Verify {pending.length} pending claims</Btn>}

        <section>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>READER SUMMARY</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{source.summary || "This source has not yet been summarized. Re-run ingestion with reader metadata to populate the summary, audience, why-it-matters note, and key takeaways."}</div>
        </section>
        {(source.audience || source.why_it_matters) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {source.audience && (
              <section style={{ background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>AUDIENCE</div>
                <div style={{ fontSize: 13, lineHeight: 1.55 }}>{source.audience}</div>
              </section>
            )}
            {source.why_it_matters && (
              <section style={{ background: c.panel2, border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>WHY IT MATTERS</div>
                <div style={{ fontSize: 13, lineHeight: 1.55 }}>{source.why_it_matters}</div>
              </section>
            )}
          </div>
        )}
        {(source.takeaways || []).length > 0 && (
          <section>
            <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 6 }}>KEY TAKEAWAYS</div>
            <div style={{ display: "grid", gap: 7 }}>
              {source.takeaways.map((t, i) => (
                <div key={i} style={{ border: "1px solid " + c.lineSoft, borderRadius: 6, padding: "8px 10px", background: c.panel2, fontSize: 13, lineHeight: 1.45 }}>{t}</div>
              ))}
            </div>
          </section>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(source.tags || []).map((t) => <Chip key={t} color={c.accentText}>#{t}</Chip>)}
          {capabilityIds.map((id) => <button key={id} onClick={() => onOpenCapability?.(id)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}><Chip color={c.accentText}>{capName(id)}</Chip></button>)}
        </div>
        {diagrams.length > 0 && (
          <section>
            <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>RELATED GENERATED DIAGRAMS</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {diagrams.map((a) => <DiagramThumb key={a.id} asset={a} onClick={() => onOpenDiagram(a)} />)}
            </div>
          </section>
        )}
        {referenced.length > 0 && (
          <section>
            <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>REFERENCED SOURCE ASSETS</div>
            <div style={{ display: "grid", gap: 8 }}>
              {referenced.map((a) => (
                <div key={a.id} style={{ border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 10, background: c.panel2 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>{a.caption}</div>
                  <div style={{ fontSize: 11, color: c.faint, marginTop: 4 }}><a href={a.url} target="_blank" rel="noreferrer" style={{ color: c.accentText }}>View original</a> · {a.attribution}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>CLAIMS BY CAPABILITY</div>
          <div style={{ display: "grid", gap: 12 }}>
            {grouped.map(([id, rows]) => (
              <div key={id}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 7 }}>
                  <button onClick={() => onOpenCapability?.(id)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}><Chip color={c.accentText}>{capName(id)}</Chip></button>
                  <Chip>{rows.length} claims</Chip>
                </div>
                <ClaimRows claims={rows} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================== designs ============================= */
function Designs() {
  const [designs, setDesigns] = useState([]);
  const [open, setOpen] = useState(null);     // full design detail
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { api("/designs").then(setDesigns).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const view = async (id) => {
    setOpen(await api("/designs/" + id));
    setRuns(await api(`/designs/${id}/validations`));
  };
  const validate = async () => {
    setBusy(true);
    try { await api(`/designs/${open.id}/validate`, { method: "POST", body: JSON.stringify({}) }); await view(open.id); refresh(); }
    finally { setBusy(false); }
  };

  if (!designs.length) return <Empty>No designs yet. Run <Code>/design &lt;scenario&gt;</Code> in Claude Code.</Empty>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: open ? "minmax(260px, 320px) 1fr" : "1fr", gap: 16 }}>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        {designs.map((d) => (
          <button key={d.id} onClick={() => view(d.id)} style={{ textAlign: "left", cursor: "pointer", background: open?.id === d.id ? c.accentSoft : c.panel, border: "1px solid " + (open?.id === d.id ? c.accent : c.line), borderRadius: 8, padding: 12, boxShadow: c.shadow }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: c.text }}>{d.title || d.scenario.slice(0, 50)}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip color={d.status === "validated" ? c.green : d.status === "needs_review" ? c.red : c.amber}>{d.status}</Chip>
              {d.confidence != null && <Chip color={c.accentText}>{Math.round(d.confidence * 100)}%</Chip>}
              {(d.tags || []).map((t) => <Chip key={t} color={c.accentText}>#{t}</Chip>)}
            </div>
          </button>
        ))}
      </div>
      {open && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 18, boxShadow: c.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{open.title}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small primary onClick={validate} disabled={busy}>{busy ? "Validating…" : "Run validation"}</Btn>
              <Btn small onClick={() => setOpen(null)}>Close</Btn>
            </div>
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 10 }}>{open.scenario}</div>
          {(open.assets || []).filter((a) => a.kind === "generated" && a.path).map((a) => (
            <img key={a.id} src={"/" + a.path.replace(/^\//, "")} alt={a.caption} style={{ maxWidth: "100%", borderRadius: 6, background: c.diagramBg, marginBottom: 12 }} onError={(e) => { e.target.style.display = "none"; }} />
          ))}
          <Md text={open.output_md} />
          {runs.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid " + c.line }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>VALIDATION RUNS</div>
              {runs.map((r) => (
                <div key={r.id} style={{ marginBottom: 12 }}>
                  <Chip color={c.accentText}>confidence {Math.round(r.confidence * 100)}%</Chip>
                  <div style={{ marginTop: 6, display: "grid", gap: 5 }}>
                    {r.issues.map((i) => (
                      <div key={i.id} style={{ fontSize: 12, display: "flex", gap: 8 }}>
                        <Chip color={SEV_COLORS[i.severity]}>{i.severity}</Chip>
                        <Chip>{i.validator}</Chip>
                        <span style={{ color: c.text }}>{i.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =============================== learn ============================== */
/* Lessons are authored by the learning-author agent into content/lessons/
   (grounded in verified claims only) and served statically by the backend.
   This tab lists and renders them. */
function Learn({ onOpenCapability }) {
  const [files, setFiles] = useState(null);   // null = loading
  const [open, setOpen] = useState(null);     // { name, md }
  const [cap, setCap] = useState("lakehouse");
  const [claims, setClaims] = useState([]);
  const [sources, setSources] = useState([]);
  const [assets, setAssets] = useState([]);
  const [openDiagram, setOpenDiagram] = useState(null);
  useEffect(() => {
    api("/lessons/files").then(setFiles).catch(() => setFiles([]));
    api("/claims?include_inactive=true").then(setClaims).catch(() => setClaims([]));
    api("/sources").then(setSources).catch(() => setSources([]));
    api("/assets").then(setAssets).catch(() => setAssets([]));
  }, []);

  const view = async (f) => {
    const res = await fetch("/" + f.path.replace(/^\//, ""));
    setOpen({ name: f.name, md: res.ok ? await res.text() : "Could not load lesson." });
  };

  if (files === null) return null;
  const capClaims = claims.filter((cl) => cl.capability_id === cap && cl.active !== false);
  const verified = capClaims.filter((cl) => cl.status === "verified");
  const pendingCommunity = capClaims.filter((cl) => cl.status === "pending" && isCommunitySource(sources.find((s) => s.id === cl.source_id)));
  const capSourceIds = [...new Set(capClaims.map((cl) => cl.source_id))];
  const capSources = capSourceIds.map((id) => sources.find((s) => s.id === id)).filter(Boolean);
  const capDiagrams = assets.filter((a) => a.kind === "generated" && a.path && a.capability_id === cap);
  const capFiles = (files || []).filter((f) => f.name.toLowerCase().startsWith(cap.toLowerCase() + "-"));
  const beginner = verified.filter((cl) => cl.depth <= 2).length;
  const intermediate = verified.filter((cl) => cl.depth === 3).length;
  const expert = verified.filter((cl) => cl.depth >= 4).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: open ? "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" : "1fr", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 14, boxShadow: c.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 650, fontSize: 15 }}>{capName(cap)}</div>
              <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Learning view over verified claims, source summaries, and diagrams.</div>
            </div>
            <select value={cap} onChange={(e) => { setCap(e.target.value); setOpen(null); }} style={{ fontFamily: sans, fontSize: 13, color: c.text, background: c.panel2, border: "1px solid " + c.line, borderRadius: 4, padding: "8px 10px", maxWidth: 260 }}>
              {CAPABILITIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip color={c.green}>{verified.length} verified claims</Chip>
            <Chip color={pendingCommunity.length ? c.amber : c.faint}>{pendingCommunity.length} pending community insights</Chip>
            <Chip color={capDiagrams.length ? c.accentText : c.faint}>{capDiagrams.length} diagrams</Chip>
            <Btn small onClick={() => onOpenCapability?.(cap)}>Open Registry</Btn>
          </div>
        </div>

        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 14, boxShadow: c.shadow }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>LESSON READINESS</div>
          <div style={{ display: "grid", gap: 7 }}>
            {[
              ["Beginner", beginner, "L1-L2"],
              ["Intermediate", intermediate, "L3"],
              ["Expert", expert, "L4-L5"],
            ].map(([level, count, depths]) => (
              <div key={level} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", border: "1px solid " + c.lineSoft, borderRadius: 6, padding: "8px 10px", background: c.panel2 }}>
                <span style={{ fontSize: 13 }}>{level} <span style={{ color: c.faint }}>({depths})</span></span>
                <Chip color={count ? c.green : c.amber}>{count} verified</Chip>
              </div>
            ))}
          </div>
          {verified.length === 0 && (
            <div style={{ color: c.muted, fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>
              This capability has no verified claims yet. Verify relevant claims first, then run <Code>/lesson {cap} &lt;level&gt;</Code>.
            </div>
          )}
        </div>

        {capFiles.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {capFiles.map((f) => (
              <button key={f.name} onClick={() => view(f)} style={{ textAlign: "left", cursor: "pointer", background: open?.name === f.name ? c.accentSoft : c.panel, border: "1px solid " + (open?.name === f.name ? c.accent : c.line), borderRadius: 8, padding: 12, boxShadow: c.shadow }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: c.text }}>{f.name.replace(/\.md$/, "").replace(/-/g, " ")}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginTop: 4 }}>{f.path}</div>
              </button>
            ))}
          </div>
        ) : (
          <Empty>No generated lessons for this capability yet.</Empty>
        )}
      </div>

      <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 16, boxShadow: c.shadow }}>
        {open ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{open.name}</span>
              <Btn small onClick={() => setOpen(null)}>Close</Btn>
            </div>
            <Md text={open.md} />
          </>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {capDiagrams.length > 0 && (
              <section>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>RELATED DIAGRAMS</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {capDiagrams.map((a) => <DiagramThumb key={a.id} asset={a} onClick={() => setOpenDiagram(a)} />)}
                </div>
              </section>
            )}
            <section>
              <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>SOURCE SUMMARIES</div>
              {capSources.length === 0 ? <div style={{ color: c.muted, fontSize: 13 }}>No sources for this capability yet.</div> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {capSources.slice(0, 8).map((s) => (
                    <div key={s.id} style={{ border: "1px solid " + c.lineSoft, borderRadius: 6, background: c.panel2, padding: 10 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                        <Chip color={TIER_COLORS[s.tier]}>T{s.tier}</Chip>
                        {isCommunitySource(s) && <Chip color={c.accentText}>community blog</Chip>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
                      <div style={{ fontSize: 12.5, color: c.text, lineHeight: 1.5 }}>{s.summary || "Not yet summarized."}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>VERIFIED LEARNING CLAIMS</div>
              <ClaimRows claims={verified.slice(0, 12)} compact />
            </section>
            {pendingCommunity.length > 0 && (
              <section>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.amber, marginBottom: 8 }}>PENDING COMMUNITY INSIGHTS</div>
                <ClaimRows claims={pendingCommunity.slice(0, 8)} compact />
              </section>
            )}
          </div>
        )}
      </div>

      {!files.length && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Empty>
            No lesson files yet. Verify claims in the Registry, then in Claude Code run{" "}
            <Code>/lesson &lt;capability&gt; &lt;Beginner|Intermediate|Expert&gt;</Code>.
          </Empty>
        </div>
      )}
      <DiagramPanel
        asset={openDiagram}
        claims={claims}
        sources={sources}
        onClose={() => setOpenDiagram(null)}
        onOpenCapability={onOpenCapability}
      />
    </div>
  );
}

/* =============================== author ============================= */
function Author() {
  const steps = [
    ["1 · Ingest", "/ingest <url-or-file> tier=1", "knowledge-curator extracts claims + tags + image refs → content/sources/*.json → POST /sources/ingest"],
    ["2 · Diagram", "/diagram <capability-id>", "diagram-author draws an ORIGINAL Mermaid/SVG → content/diagrams/* → POST /assets"],
    ["3 · Verify", "Registry tab → Verify", "human approval — pending claims become verified"],
    ["4 · Design", "/design <scenario>", "solution-architect writes a cited architecture → content/designs/*.md → POST /designs"],
    ["5 · Validate", "/validate <design-id>", "validation-reviewer reasons locally, posts issues; server adds citation + freshness → confidence"],
    ["6 · Teach", "/lesson <capability> <level>", "learning-author writes a grounded lesson → content/lessons/*.md → Learn tab"],
    ["7 · Maintain", "/drift <source-key>", "source-drift-analyst re-extracts, supersedes changed claims, flags affected designs"],
  ];
  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ color: c.muted, fontSize: 13, lineHeight: 1.6 }}>
        Authoring happens in the IDE — the Claude Code / Codex agents are the LLM engine (your
        subscription, no metered API). This UI is the review-and-serve side. The full loop:
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {steps.map(([t, cmd, desc]) => (
          <div key={t} style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: "10px 14px", display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", boxShadow: c.shadow }}>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 90 }}>{t}</span>
            <Code>{cmd}</Code>
            <span style={{ color: c.muted, fontSize: 12, flex: 1, minWidth: 220 }}>{desc}</span>
          </div>
        ))}
      </div>
      <p style={{ color: c.muted, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
        Publish authored content to any server with{" "}
        <Code>python scripts/import_content.py --base &lt;url&gt;</Code>.
        To add capabilities, sources, themes, or new views, see{" "}
        <Code>docs/extending.md</Code> — it walks through every extension point.
        Workflow and VS Code setup live in <Code>docs/workflow.md</Code>.
      </p>
    </div>
  );
}
