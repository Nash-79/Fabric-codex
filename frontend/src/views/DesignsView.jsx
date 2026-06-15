import React, { useState, useEffect, useCallback } from "react";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { SEV_COLORS } from "../lib/constants.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Btn, Empty, Code } from "../components/ui.jsx";
import { Md } from "../components/Markdown.jsx";

export default function DesignsView() {
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
            <button onClick={closeDetail} style={{ background: "transparent", border: "none", color: c.accentText, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "0 0 12px", display: "block" }}>← Back to designs</button>
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
