import React, { useState, useEffect } from "react";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { CAPABILITIES, DEPTHS } from "../lib/constants.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Btn, Code } from "../components/ui.jsx";

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

export default function OverviewView({ onOpenCapability, offline = false }) {
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
