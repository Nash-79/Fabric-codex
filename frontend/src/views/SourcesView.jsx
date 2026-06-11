import React, { useState, useEffect, useCallback } from "react";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { TIER_COLORS, TIER_LABELS } from "../lib/constants.js";
import { Chip, Btn, Empty, Code } from "../components/ui.jsx";

export default function SourcesView() {
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
