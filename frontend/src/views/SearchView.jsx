import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { c, mono, sans } from "../theme.js";
import { api } from "../lib/api.js";
import { CAPABILITIES, TIER_COLORS } from "../lib/constants.js";
import { Chip, Empty } from "../components/ui.jsx";

const KINDS = [["", "All"], ["blog", "Articles"], ["topic", "Topics"], ["claim", "Claims"], ["source", "Sources"]];

function Snippet({ html }) {
  // The backend wraps matches in <b>…</b> via FTS5 snippet(); render just that tag.
  const parts = (html || "").split(/(<b>|<\/b>)/);
  let bold = false;
  return (
    <span style={{ fontSize: 13, color: c.text, lineHeight: 1.55 }}>
      {parts.map((p, i) => {
        if (p === "<b>") { bold = true; return null; }
        if (p === "</b>") { bold = false; return null; }
        return bold
          ? <mark key={i} style={{ background: c.accentSoft, color: c.accentText, fontWeight: 600, padding: 0 }}>{p}</mark>
          : <span key={i}>{p}</span>;
      })}
    </span>
  );
}

export default function SearchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const kind = searchParams.get("kind") || "";
  const tag = searchParams.get("tag") || "";
  const [input, setInput] = useState(q);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState("");
  const debounceRef = useRef(null);

  const setParam = (key, value) => {
    setSearchParams((params) => {
      if (value) params.set(key, value); else params.delete(key);
      return params;
    }, { replace: true });
  };

  // debounce typing into ?q=
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { if (input !== q) setParam("q", input); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [input]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const params = new URLSearchParams({ q });
    if (kind) params.set("kind", kind);
    if (tag) params.set("tag", tag);
    api("/search?" + params.toString()).then((r) => { setResults(r); setErr(""); })
      .catch((e) => setErr(e.message));
  }, [q, kind, tag]);

  const groups = results
    ? [["Articles", results.blogs], ["Topics", results.topics], ["Claims", results.claims], ["Sources", results.sources]]
    : [];
  const total = results
    ? (results.blogs?.length || 0) + (results.topics?.length || 0) + (results.claims?.length || 0) + (results.sources?.length || 0)
    : 0;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search the knowledge base — articles, topics, claims, sources…"
        style={{ width: "100%", boxSizing: "border-box", fontFamily: sans, fontSize: 15, color: c.text, background: c.panel, border: "1px solid " + c.line, borderRadius: 8, padding: "12px 16px", outline: "none", boxShadow: c.shadow }}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 16px", alignItems: "center" }}>
        {KINDS.map(([k, label]) => (
          <button key={k} onClick={() => setParam("kind", k)}
            style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: kind === k ? c.onAccent : c.accentText, background: kind === k ? c.accent : c.accentSoft, border: "1px solid " + (kind === k ? c.accent : c.accentDim), borderRadius: 12, padding: "3px 11px" }}>
            {label}
          </button>
        ))}
        {tag && (
          <button onClick={() => setParam("tag", "")}
            style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: c.onAccent, background: c.accent, border: "1px solid " + c.accent, borderRadius: 12, padding: "3px 11px" }}>
            #{tag} ×
          </button>
        )}
      </div>

      {err && <div style={{ color: c.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!q.trim() && (
        <Empty>
          Type to search. Filter by kind with the chips, or narrow to a hashtag from any result.
        </Empty>
      )}
      {results && total === 0 && <Empty>No matches for “{q}”.</Empty>}

      {groups.map(([label, rows]) => (rows || []).length > 0 && (
        <div key={label} style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            {label} <span>({rows.length})</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r) => {
              const inner = (
                <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: "11px 14px", boxShadow: c.shadow, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: c.text }}>{r.title}</span>
                    {r.kind === "claim" && r.capability_id && (
                      <Chip color={c.accentText}>{CAPABILITIES.find((x) => x.id === r.capability_id)?.name || r.capability_id}</Chip>
                    )}
                    {r.kind === "claim" && r.status && <Chip color={r.status === "verified" ? c.green : c.amber}>{r.status}</Chip>}
                    {r.kind === "source" && r.tier && <Chip color={TIER_COLORS[r.tier]}>T{r.tier}</Chip>}
                    {r.kind === "blog" && r.status && <Chip color={r.status === "validated" ? c.green : r.status === "needs_review" ? c.red : c.amber}>{r.status}</Chip>}
                  </div>
                  <Snippet html={r.snippet} />
                  {(r.tags || []).length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                      {r.tags.map((t) => (
                        <button key={t} onClick={(e) => { e.preventDefault(); setParam("tag", t); }}
                          style={{ cursor: "pointer", fontFamily: mono, fontSize: 10, color: c.accentText, background: "transparent", border: "1px solid " + c.accentDim, borderRadius: 10, padding: "1px 7px" }}>#{t}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
              const to =
                r.kind === "blog" ? `/blog/${r.ref}` :
                r.kind === "topic" ? `/topics/${r.ref}` :
                r.kind === "claim" ? `/registry?cap=${r.capability_id || ""}` :
                "/sources";
              return <Link key={r.kind + r.ref + (r.id || "")} to={to} style={{ textDecoration: "none" }}>{inner}</Link>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
