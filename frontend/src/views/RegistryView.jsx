import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { CAPABILITIES, DEPTHS } from "../lib/constants.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Btn, CountdownBtn, Empty, Code } from "../components/ui.jsx";

export default function RegistryView() {
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const isNarrow = w < 400;
  const [searchParams, setSearchParams] = useSearchParams();
  const cap = searchParams.get("cap") || null;
  const setCap = useCallback((next) => {
    setSearchParams((params) => {
      if (next) params.set("cap", next); else params.delete("cap");
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const [coverage, setCoverage] = useState({});
  const [claims, setClaims] = useState([]);
  const [tags, setTags] = useState({});
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
  const [actionFilter, setActionFilter] = useState(null); // null | "verified" | "rejected" | "dismissed" | "promoted"
  const [capFilter, setCapFilter] = useState("");
  const [undoToast, setUndoToast] = useState(null); // null | { label, claimIds }
  const undoTimerRef = useRef(null);

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

  const showUndoToast = useCallback((label, claimIds) => {
    if (!claimIds || claimIds.length === 0) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ label, claimIds });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, []);

  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoToast) return;
    const ids = undoToast.claimIds;
    dismissUndoToast();
    try {
      await api("/claims/revert", { method: "POST", body: JSON.stringify({ claim_ids: ids }) });
    } catch (e) { setErr(e.message); }
    refresh();
  }, [undoToast, dismissUndoToast, refresh]);

  const withActioning = async (id, fn) => {
    setActioning((prev) => new Set([...prev, id]));
    let result;
    try { result = await fn(); } catch (e) { setErr(e.message); }
    finally { setActioning((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
    refresh();
    return result;
  };

  const verify = async (id) => {
    await withActioning(id, () => api(`/claims/${id}/verify`, { method: "POST" }));
    showUndoToast("Verified claim", [id]);
  };
  const reject = async (id) => {
    await withActioning(id, () => api(`/claims/${id}/reject`, { method: "POST" }));
    showUndoToast("Rejected claim", [id]);
  };
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
      const ids = pendingShown.map((cl) => cl.id);
      const res = await api("/claims/verify-bulk", { method: "POST", body: JSON.stringify({ claim_ids: ids }) });
      showUndoToast(`Verified ${res.verified} claim${res.verified !== 1 ? "s" : ""}`, res.verified_ids);
    } catch (e) { setErr(e.message); }
    refresh();
  };
  const rejectAllShown = async () => {
    if (bulkConfirm !== "reject") { armBulk("reject"); return; }
    setBulkConfirm(null);
    try {
      const ids = pendingShown.map((cl) => cl.id);
      const res = await api("/claims/reject-bulk", { method: "POST", body: JSON.stringify({ claim_ids: ids }) });
      showUndoToast(`Rejected ${res.rejected} claim${res.rejected !== 1 ? "s" : ""}`, res.rejected_ids);
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

  const filteredActions = recentActions.filter((ev) => {
    if (actionFilter && ev.action !== actionFilter) return false;
    if (capFilter && ev.capability_id !== capFilter) return false;
    return true;
  });
  const actionCapIds = [...new Set(recentActions.map((ev) => ev.capability_id))];
  const ACTION_TYPES = ["verified", "rejected", "dismissed", "promoted"];

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
              Recent actions{" "}
              <span style={{ color: c.faint }}>
                {filteredActions.length < recentActions.length
                  ? `(${filteredActions.length} of ${recentActions.length})`
                  : `(${recentActions.length})`}
              </span>
            </span>
            <span style={{ fontFamily: mono, fontSize: 11, color: c.faint }}>{actionsOpen ? "▲ hide" : "▼ show"}</span>
          </button>
          {actionsOpen && (
            <div style={{ borderTop: "1px solid " + c.lineSoft }}>
              {/* ── filter bar ── */}
              <div style={{ padding: "8px 14px", borderBottom: "1px solid " + c.lineSoft, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* capability dropdown */}
                <select
                  value={capFilter}
                  onChange={(e) => setCapFilter(e.target.value)}
                  style={{ fontFamily: mono, fontSize: 11, color: capFilter ? c.accentText : c.muted, background: capFilter ? c.accentSoft : c.bg, border: "1px solid " + (capFilter ? c.accent : c.line), borderRadius: 6, padding: "3px 7px", cursor: "pointer" }}
                >
                  <option value="">All capabilities</option>
                  {actionCapIds.map((id) => (
                    <option key={id} value={id}>{CAPABILITIES.find((x) => x.id === id)?.name || id}</option>
                  ))}
                </select>
                {/* action-type chips */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {ACTION_TYPES.filter((a) => recentActions.some((ev) => ev.action === a)).map((a) => {
                    const active = actionFilter === a;
                    const chipColor = a === "verified" ? c.green : a === "rejected" || a === "dismissed" ? c.red : c.amber;
                    return (
                      <button
                        key={a}
                        onClick={() => setActionFilter(active ? null : a)}
                        style={{ fontFamily: mono, fontSize: 11, cursor: "pointer", borderRadius: 12, padding: "2px 9px", border: "1px solid " + (active ? chipColor : c.line), background: active ? chipColor + "22" : "transparent", color: active ? chipColor : c.muted }}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
                {/* clear filters */}
                {(actionFilter || capFilter) && (
                  <button
                    onClick={() => { setActionFilter(null); setCapFilter(""); }}
                    style={{ fontFamily: mono, fontSize: 11, cursor: "pointer", color: c.faint, background: "transparent", border: "none", padding: "2px 4px", textDecoration: "underline" }}
                  >
                    clear
                  </button>
                )}
              </div>
              {filteredActions.length === 0 ? (
                <div style={{ padding: "18px 14px", fontFamily: mono, fontSize: 12, color: c.faint, textAlign: "center" }}>No actions match the current filters.</div>
              ) : (
                filteredActions.map((ev) => {
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
                })
              )}
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
                  <CountdownBtn small primary onClick={verifyAllShown} countdown={bulkConfirm === "verify"}>
                    {bulkConfirm === "verify" ? `Confirm verify all? (${pendingShown.length})` : `Verify all (${pendingShown.length})`}
                  </CountdownBtn>
                  <CountdownBtn small onClick={rejectAllShown} countdown={bulkConfirm === "reject"}>
                    {bulkConfirm === "reject" ? `Confirm reject all? (${pendingShown.length})` : `Reject all (${pendingShown.length})`}
                  </CountdownBtn>
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
                        <CountdownBtn small onClick={() => rejectWithConfirm(cl.id)} countdown={rejectConfirm.has(cl.id)}>
                          {rejectConfirm.has(cl.id) ? "Confirm reject?" : "Reject"}
                        </CountdownBtn>
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

      {undoToast && (
        <div key={undoToast.label + undoToast.claimIds[0]} style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: c.panel, border: "1px solid " + c.line, borderRadius: 8, boxShadow: "0 4px 18px rgba(0,0,0,0.22)", minWidth: 260, maxWidth: 400, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
            <span style={{ flex: 1, fontSize: 13, color: c.text }}>{undoToast.label}</span>
            <button
              onClick={handleUndo}
              style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", color: c.accentText, background: c.accentSoft, border: "1px solid " + c.accentDim, borderRadius: 4, padding: "4px 12px", whiteSpace: "nowrap" }}
            >
              Undo
            </button>
            <button
              onClick={dismissUndoToast}
              style={{ background: "transparent", border: "none", color: c.faint, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div style={{ height: 3, background: c.lineSoft }}>
            <div key={undoToast.claimIds.join(",")} style={{ height: "100%", background: c.accent, animation: "cd-shrink 5s linear forwards", transformOrigin: "left" }} />
          </div>
        </div>
      )}
    </div>
  );
}
