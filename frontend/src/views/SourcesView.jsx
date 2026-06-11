import React, { useState, useEffect, useCallback } from "react";
import { c, mono, sans } from "../theme.js";
import { api } from "../lib/api.js";
import { TIER_COLORS, TIER_LABELS } from "../lib/constants.js";
import { Chip, Btn, Empty, Code } from "../components/ui.jsx";

const QUEUE_STATUS_COLORS = { queued: c.amber, claimed: c.accentText, ingested: c.green, failed: c.red, dismissed: c.faint };

const inputStyle = {
  fontFamily: sans, fontSize: 13, color: c.text, background: c.bg,
  border: "1px solid " + c.line, borderRadius: 6, padding: "8px 10px", outline: "none",
  boxSizing: "border-box",
};

/* URL submission — the queue is the bridge between the frontend and the local
   knowledge-curator agent: submitted URLs wait here until /ingest-batch pulls
   them; the server itself never fetches a URL or runs an LLM. */
function SubmitSourceForm({ onSubmitted }) {
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState("6");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/queue", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(), tier: Number(tier), notes,
          tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
        }),
      });
      setMsg({ ok: true, text: "Queued. Run /ingest-batch in Claude Code to ingest it." });
      setUrl(""); setNotes(""); setTags("");
      onSubmitted();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, padding: 16, boxShadow: c.shadow }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Add a source</div>
      <div style={{ fontSize: 12, color: c.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Paste a URL to queue it for ingestion. The local knowledge-curator agent turns it into
        cited, human-verified claims — nothing enters the knowledge base unreviewed.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 200px", gap: 8 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={inputStyle} aria-label="Source URL" />
        <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} aria-label="Trust tier">
          {Object.entries(TIER_LABELS).map(([n, label]) => (
            <option key={n} value={n}>T{n} · {label}</option>
          ))}
        </select>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags (comma-separated, optional)" style={inputStyle} aria-label="Tags" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes for the curator (optional)" style={inputStyle} aria-label="Notes" />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <Btn small primary disabled={busy || !url.trim()}>{busy ? "Submitting…" : "Queue for ingestion"}</Btn>
        {msg && <span style={{ fontSize: 12.5, color: msg.ok ? c.green : c.red }}>{msg.text}</span>}
      </div>
    </form>
  );
}

function QueuePanel({ queue, onAction }) {
  const visible = queue.filter((q) => q.status !== "dismissed");
  if (!visible.length) return null;
  return (
    <div style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, boxShadow: c.shadow }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, textTransform: "uppercase", letterSpacing: 0.6, padding: "10px 14px", borderBottom: "1px solid " + c.lineSoft }}>
        Ingestion queue ({visible.length})
      </div>
      {visible.map((q) => (
        <div key={q.id} style={{ padding: "9px 14px", borderBottom: "1px solid " + c.lineSoft, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Chip color={QUEUE_STATUS_COLORS[q.status] || c.muted}>{q.status}</Chip>
          <Chip color={TIER_COLORS[q.tier]}>T{q.tier}</Chip>
          <a href={q.url} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 12, color: c.accentText, textDecoration: "none", flex: 1, minWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.url}</a>
          {q.error && <span style={{ fontSize: 11.5, color: c.red }}>{q.error}</span>}
          <span style={{ display: "flex", gap: 6 }}>
            {q.status === "failed" && <Btn small onClick={() => onAction(q.id, "requeue")}>Retry</Btn>}
            {(q.status === "queued" || q.status === "failed") && <Btn small onClick={() => onAction(q.id, "dismiss")}>Dismiss</Btn>}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SourcesView() {
  const [sources, setSources] = useState([]);
  const [assets, setAssets] = useState([]);
  const [queue, setQueue] = useState([]);
  const [pendingBySource, setPendingBySource] = useState({});
  const [err, setErr] = useState("");
  const refresh = useCallback(() => {
    api("/sources").then(setSources).catch((e) => setErr(e.message));
    api("/assets").then(setAssets).catch(() => {});
    api("/queue").then(setQueue).catch(() => {});
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
  const queueAction = async (id, action) => {
    try { await api(`/queue/${id}/${action}`, { method: "POST" }); } catch (e) { setErr(e.message); }
    refresh();
  };
  if (err) return <div style={{ color: c.red, fontSize: 13 }}>{err}</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <SubmitSourceForm onSubmitted={refresh} />
      <QueuePanel queue={queue} onAction={queueAction} />
      {!sources.length && (
        <Empty>No sources yet. Queue a URL above, then run <Code>/ingest-batch</Code> in Claude Code and publish.</Empty>
      )}
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
