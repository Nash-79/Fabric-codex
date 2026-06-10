import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { c, BRAND, sans, mono, applyTheme, initialTheme } from "./theme.js";

/* ------------------- responsive breakpoint hook -------------------- */
const MOBILE = 640;  // px — single source of truth for the mobile breakpoint
function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}

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
  const w = useWindowWidth();
  const isMobile = w < MOBILE;

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
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "0 12px" : "0 20px" }}>
        {/* Header — stacks vertically on mobile */}
        <div style={{ padding: isMobile ? "12px 0 10px" : "16px 0 12px", borderBottom: "1px solid " + c.line, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? 8 : 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <AtlasMark />
            <div>
              <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 600 }}>
                Fabric Atlas
                <span style={{ fontWeight: 400, color: c.muted, fontSize: 13, marginLeft: 8 }}>for Microsoft Fabric</span>
              </div>
              {!isMobile && <div style={{ color: c.muted, fontSize: 12 }}>Governed knowledge → grounded architecture</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Chip color={health === "ok" ? c.green : health === "down" ? c.red : c.muted}>
              backend {health === "ok" ? "● connected" : health === "down" ? (isMobile ? "● down" : "● unreachable — run uvicorn") : "…"}
            </Chip>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={"Switch to " + (theme === "light" ? "dark" : "light") + " theme"}
              style={{ cursor: "pointer", background: c.panel, color: c.muted, border: "1px solid " + c.line, borderRadius: 4, padding: "4px 10px", fontFamily: sans, fontSize: 12, minHeight: 30 }}>
              {theme === "light" ? "◑ Dark" : "◐ Light"}
            </button>
          </div>
        </div>
        {/* Tab bar — horizontally scrollable, touch-friendly on mobile */}
        <div style={{ display: "flex", borderBottom: "1px solid " + c.line, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ fontFamily: sans, fontSize: 13, fontWeight: tab === id ? 600 : 500, cursor: "pointer", background: "transparent", border: "none", color: tab === id ? c.text : c.muted, borderBottom: "2.5px solid " + (tab === id ? c.accent : "transparent"), padding: isMobile ? "12px 12px" : "12px 14px", marginBottom: -1, whiteSpace: "nowrap", minHeight: 44 }}>{label}</button>
          ))}
        </div>
        <div style={{ padding: isMobile ? "16px 0 40px" : "20px 0 60px" }}>
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
            : tab === "sources" ? <Sources />
            : tab === "designs" ? <Designs />
            : tab === "learn" ? <Learn />
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
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(330px, 1fr))", gap: 12, marginBottom: 22 }}>
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
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const isNarrow = w < 400;
  const [coverage, setCoverage] = useState({});
  const [claims, setClaims] = useState([]);
  const [tags, setTags] = useState({});
  const [cap, setCap] = useState(initialCap);
  const [tagFilter, setTagFilter] = useState("");
  const [history, setHistory] = useState(null);
  const [capAssets, setCapAssets] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [dupOpen, setDupOpen] = useState(false);
  const [actioning, setActioning] = useState(new Set()); // claim IDs with in-flight requests
  const [err, setErr] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(null); // null | "verify" | "reject"
  const [rejectConfirm, setRejectConfirm] = useState(new Set()); // claim IDs pending reject confirm
  const [recentActions, setRecentActions] = useState([]);
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => { if (initialCap) onConsumedInitial(); }, [initialCap, onConsumedInitial]);
  useEffect(() => {
    if (!cap) { setCapAssets([]); setDuplicates([]); return; }
    api("/assets?capability=" + cap).then(setCapAssets).catch(() => setCapAssets([]));
    api(`/claims?capability=${cap}&status=duplicate&include_inactive=true`)
      .then(setDuplicates).catch(() => setDuplicates([]));
  }, [cap]);

  const refresh = useCallback(() => {
    api("/coverage").then(setCoverage).catch((e) => setErr(e.message));
    api("/tags").then(setTags).catch(() => {});
    api("/claims/recent-actions").then(setRecentActions).catch(() => {});
    const q = new URLSearchParams();
    if (cap) q.set("capability", cap);
    if (tagFilter) q.set("tag", tagFilter);
    api("/claims?" + q.toString()).then(setClaims).catch((e) => setErr(e.message));
    if (cap) {
      api(`/claims?capability=${cap}&status=duplicate&include_inactive=true`)
        .then(setDuplicates).catch(() => setDuplicates([]));
    }
  }, [cap, tagFilter]);
  useEffect(() => { refresh(); }, [refresh]);

  const withActioning = async (id, fn) => {
    setActioning((prev) => new Set([...prev, id]));
    try { await fn(); } catch (e) { setErr(e.message); }
    finally { setActioning((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
    refresh();
  };

  const verify = (id) => withActioning(id, () => api(`/claims/${id}/verify`, { method: "POST" }));
  const reject = (id) => withActioning(id, () => api(`/claims/${id}/reject`, { method: "POST" }));
  const promote = (id) => withActioning(id, () => api(`/claims/${id}/promote`, { method: "POST" }));
  const dismissDup = (id) => withActioning(id, () => api(`/claims/${id}/dismiss`, { method: "POST" }));

  const pendingShown = claims.filter((cl) => cl.status === "pending");

  const armBulk = (which) => {
    setBulkConfirm(which);
    setTimeout(() => setBulkConfirm((cur) => cur === which ? null : cur), 3000);
  };
  const verifyAllShown = async () => {
    if (bulkConfirm !== "verify") { armBulk("verify"); return; }
    setBulkConfirm(null);
    try {
      await api("/claims/verify-bulk", { method: "POST", body: JSON.stringify({ claim_ids: pendingShown.map((cl) => cl.id) }) });
    } catch (e) { setErr(e.message); }
    refresh();
  };
  const rejectAllShown = async () => {
    if (bulkConfirm !== "reject") { armBulk("reject"); return; }
    setBulkConfirm(null);
    try {
      await api("/claims/reject-bulk", { method: "POST", body: JSON.stringify({ claim_ids: pendingShown.map((cl) => cl.id) }) });
    } catch (e) { setErr(e.message); }
    refresh();
  };

  const armReject = (id) => {
    setRejectConfirm((prev) => new Set([...prev, id]));
    setTimeout(() => setRejectConfirm((prev) => { const s = new Set(prev); s.delete(id); return s; }), 3000);
  };
  const rejectWithConfirm = (id) => {
    if (!rejectConfirm.has(id)) { armReject(id); return; }
    setRejectConfirm((prev) => { const s = new Set(prev); s.delete(id); return s; });
    reject(id);
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
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
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

      {recentActions.length > 0 && (
        <div style={{ marginTop: 18, border: "1px solid " + c.line, borderRadius: 8, background: c.panel, boxShadow: c.shadow }}>
          <button
            onClick={() => setActionsOpen((v) => !v)}
            style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span style={{ fontFamily: mono, fontSize: 11, color: c.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Recent actions <span style={{ color: c.faint }}>({recentActions.length})</span>
            </span>
            <span style={{ fontFamily: mono, fontSize: 11, color: c.faint }}>{actionsOpen ? "▲ hide" : "▼ show"}</span>
          </button>
          {actionsOpen && (
            <div style={{ borderTop: "1px solid " + c.lineSoft }}>
              {recentActions.map((ev) => {
                const capName = CAPABILITIES.find((x) => x.id === ev.capability_id)?.name || ev.capability_id;
                const actionColor = ev.action === "verified" ? c.green : ev.action === "rejected" || ev.action === "dismissed" ? c.red : c.amber;
                const ts = new Date(ev.actioned_at);
                const timeLabel = ts.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={ev.id} style={{ padding: "9px 14px", borderBottom: "1px solid " + c.lineSoft, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: actionColor, minWidth: 68, paddingTop: 1 }}>{ev.action}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: c.text, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.text_snippet}{ev.text_snippet.length >= 120 ? "…" : ""}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                        <span style={{ fontFamily: mono, fontSize: 10, color: c.faint }}>{capName}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: c.faint }}>·</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: c.faint }}>{ev.prev_status} →</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: actionColor }}>{ev.new_status}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 10, color: c.faint, whiteSpace: "nowrap", paddingTop: 2 }}>{timeLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(cap || tagFilter) && (
        <div style={{ marginTop: 18, border: "1px solid " + c.accentDim, borderRadius: 8, background: c.panel, boxShadow: c.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid " + c.line }}>
            <span style={{ fontWeight: 600 }}>
              {cap ? CAPABILITIES.find((x) => x.id === cap)?.name : "All capabilities"}
              {tagFilter && <span style={{ color: c.accentText }}> · #{tagFilter}</span>}
              <span style={{ color: c.muted, fontWeight: 400, fontSize: 13 }}> · {claims.length} claims</span>
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {pendingShown.length > 1 && (
                <>
                  <Btn small primary onClick={verifyAllShown}>
                    {bulkConfirm === "verify" ? `Confirm verify all? (${pendingShown.length})` : `Verify all (${pendingShown.length})`}
                  </Btn>
                  <Btn small onClick={rejectAllShown}>
                    {bulkConfirm === "reject" ? `Confirm reject all? (${pendingShown.length})` : `Reject all (${pendingShown.length})`}
                  </Btn>
                </>
              )}
              {duplicates.length > 0 && (
                <button onClick={() => setDupOpen((v) => !v)} style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: c.amber, background: "transparent", border: "1px solid " + c.amber, borderRadius: 4, padding: "3px 8px" }}>
                  {dupOpen ? "Hide" : "Show"} {duplicates.length} duplicate{duplicates.length !== 1 ? "s" : ""}
                </button>
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
          <div>
            {claims.length === 0 && <div style={{ padding: 16, color: c.muted, fontSize: 13 }}>No claims match.</div>}
            {claims.map((cl) => {
              const busy = actioning.has(cl.id);
              return (
                <div key={cl.id} style={{ padding: "11px 14px", borderBottom: "1px solid " + c.lineSoft, opacity: busy ? 0.5 : 1, transition: "opacity 0.15s" }}>
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
                    {busy ? (
                      <span style={{ fontFamily: mono, fontSize: 12, color: c.muted }}>…</span>
                    ) : cl.status === "pending" ? (
                      <>
                        <Btn small primary onClick={() => verify(cl.id)}>Verify</Btn>
                        <Btn small onClick={() => rejectWithConfirm(cl.id)}>
                          {rejectConfirm.has(cl.id) ? "Confirm reject?" : "Reject"}
                        </Btn>
                      </>
                    ) : null}
                    <Btn small disabled={busy} onClick={async () => !busy && setHistory(await api(`/claims/${cl.claim_key}/history`))}>History</Btn>
                  </div>
                </div>
              );
            })}
          </div>

          {dupOpen && duplicates.length > 0 && (
            <div style={{ borderTop: "2px solid " + c.amber }}>
              <div style={{ padding: "10px 14px", background: c.panel2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: c.amber, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Duplicate claims — {duplicates.length} awaiting review
                </span>
                <span style={{ fontFamily: mono, fontSize: 11, color: c.faint }}>Promote to re-enter verify queue · Dismiss to confirm as duplicate</span>
              </div>
              {duplicates.map((cl) => {
                const busy = actioning.has(cl.id);
                return (
                  <div key={cl.id} style={{ padding: "11px 14px", borderBottom: "1px solid " + c.lineSoft, background: c.panel2, opacity: busy ? 0.5 : 1, transition: "opacity 0.15s" }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <Chip color={c.accentText}>L{cl.depth}</Chip>
                      <Chip>{cl.type}</Chip>
                      <Chip color={c.amber}>duplicate</Chip>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55 }}>{cl.text}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 7, justifyContent: "flex-end" }}>
                      {busy ? (
                        <span style={{ fontFamily: mono, fontSize: 12, color: c.muted }}>…</span>
                      ) : (
                        <>
                          <Btn small primary onClick={() => promote(cl.id)}>Promote</Btn>
                          <Btn small onClick={() => dismissDup(cl.id)}>Dismiss</Btn>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
function Sources() {
  const [sources, setSources] = useState([]);
  const [assets, setAssets] = useState([]);
  const [pendingBySource, setPendingBySource] = useState({});
  const [err, setErr] = useState("");
  const refresh = useCallback(() => {
    api("/sources").then(setSources).catch((e) => setErr(e.message));
    api("/assets").then(setAssets).catch(() => {});
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
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {sources.map((s) => {
        const sa = assets.filter((a) => a.source_id === s.id);
        const pending = pendingBySource[s.id] || 0;
        return (
          <div key={s.id} style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 14, boxShadow: c.shadow }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip color={TIER_COLORS[s.tier]}>{`T${s.tier} · ${TIER_LABELS[s.tier] || ""}`}</Chip>
              <Chip color={c.faint}>v{s.version}</Chip>
              {!s.active && <Chip color={c.faint}>superseded</Chip>}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span>
              {(s.tags || []).map((t) => <Chip key={t} color={c.accentText}>#{t}</Chip>)}
              {pending > 0 && (
                <span style={{ marginLeft: "auto" }}>
                  <Btn small primary onClick={() => verifySource(s.id)}>Verify {pending} pending</Btn>
                </span>
              )}
            </div>
            {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 11, color: c.faint, display: "block", marginTop: 6, textDecoration: "none" }}>{s.url}</a>}
            {sa.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {sa.map((a) => (
                  <div key={a.id} style={{ border: "1px solid " + c.lineSoft, borderRadius: 6, padding: 10, maxWidth: 280, background: c.panel2 }}>
                    {a.kind === "generated" && a.path
                      ? <img src={"/" + a.path.replace(/^\//, "")} alt={a.caption} style={{ maxWidth: "100%", borderRadius: 4, background: c.diagramBg }} onError={(e) => { e.target.style.display = "none"; }} />
                      : null}
                    <div style={{ fontSize: 12, color: c.text, marginTop: 6 }}>{a.caption}</div>
                    {a.kind === "referenced" ? (
                      <div style={{ fontSize: 11, color: c.faint, marginTop: 4 }}>
                        <a href={a.url} target="_blank" rel="noreferrer" style={{ color: c.accentText }}>View original ↗</a> · {a.attribution}
                      </div>
                    ) : (
                      <Chip color={c.green}>original diagram</Chip>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================== designs ============================= */
function Designs() {
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
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
  const closeDetail = () => setOpen(null);

  if (!designs.length) return <Empty>No designs yet. Run <Code>/design &lt;scenario&gt;</Code> in Claude Code.</Empty>;

  // On mobile: show list OR detail (never both simultaneously)
  const showList = !isMobile || !open;
  const showDetail = !!open;

  return (
    <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: open ? "minmax(260px, 320px) 1fr" : "1fr", gap: 16 }}>
      {showList && (
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {designs.map((d) => (
            <button key={d.id} onClick={() => view(d.id)} style={{ textAlign: "left", cursor: "pointer", background: open?.id === d.id ? c.accentSoft : c.panel, border: "1px solid " + (open?.id === d.id ? c.accent : c.line), borderRadius: 8, padding: 12, boxShadow: c.shadow }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: c.text }}>{d.title || d.scenario.slice(0, 50)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip color={d.status === "validated" ? c.green : d.status === "needs_review" ? c.red : c.amber}>{d.status}</Chip>
                {d.confidence != null && <Chip color={c.accentText}>{Math.round(d.confidence * 100)}%</Chip>}
                {d.ready_to_share && <Chip color={c.green}>✓ ready</Chip>}
                {(d.tags || []).map((t) => <Chip key={t} color={c.accentText}>#{t}</Chip>)}
              </div>
            </button>
          ))}
        </div>
      )}
      {showDetail && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: isMobile ? 14 : 18, boxShadow: c.shadow }}>
          {isMobile && (
            <button onClick={closeDetail} style={{ background: "transparent", border: "none", color: c.accentText, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "0 0 12px", display: "block" }}>← Back to designs</button>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{open.title}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small primary onClick={validate} disabled={busy}>{busy ? "Validating…" : "Run validation"}</Btn>
              {!isMobile && <Btn small onClick={closeDetail}>Close</Btn>}
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
                      <div key={i.id} style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
function Learn() {
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const [files, setFiles] = useState(null);   // null = loading
  const [open, setOpen] = useState(null);     // { name, md }
  useEffect(() => {
    api("/lessons/files").then(setFiles).catch(() => setFiles([]));
  }, []);

  const view = async (f) => {
    const res = await fetch("/" + f.path.replace(/^\//, ""));
    setOpen({ name: f.name, md: res.ok ? await res.text() : "Could not load lesson." });
  };
  const closeLesson = () => setOpen(null);

  if (files === null) return null;
  if (!files.length) {
    return (
      <Empty>
        No lessons yet. Verify claims in the Registry, then in Claude Code run{" "}
        <Code>/lesson &lt;capability&gt; &lt;Beginner|Intermediate|Expert&gt;</Code> —
        lessons are grounded only in approved claims (Beginner=L1–L2, Intermediate=L3, Expert=L4–L5).
      </Empty>
    );
  }

  // On mobile: show list OR lesson (never both simultaneously)
  const showList = !isMobile || !open;
  const showDetail = !!open;

  return (
    <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: open ? "minmax(240px, 300px) 1fr" : "1fr", gap: 16 }}>
      {showList && (
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {files.map((f) => (
            <button key={f.name} onClick={() => view(f)} style={{ textAlign: "left", cursor: "pointer", background: open?.name === f.name ? c.accentSoft : c.panel, border: "1px solid " + (open?.name === f.name ? c.accent : c.line), borderRadius: 8, padding: 12, boxShadow: c.shadow }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: c.text }}>{f.name.replace(/\.md$/, "").replace(/-/g, " ")}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginTop: 4 }}>{f.path}</div>
            </button>
          ))}
        </div>
      )}
      {showDetail && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: isMobile ? 14 : 18, boxShadow: c.shadow }}>
          {isMobile && (
            <button onClick={closeLesson} style={{ background: "transparent", border: "none", color: c.accentText, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "0 0 12px", display: "block" }}>← Back to lessons</button>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{open.name}</span>
            {!isMobile && <Btn small onClick={closeLesson}>Close</Btn>}
          </div>
          <Md text={open.md} />
        </div>
      )}
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
