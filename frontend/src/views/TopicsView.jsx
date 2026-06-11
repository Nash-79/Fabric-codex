import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { CAPABILITIES } from "../lib/constants.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Empty, Code } from "../components/ui.jsx";

const STATUS_COLORS = { validated: c.green, checked: c.amber, draft: c.amber, needs_review: c.red };

function buildTree(topics) {
  const byId = {};
  topics.forEach((t) => { byId[t.id] = { ...t, children: [] }; });
  const roots = [];
  topics.forEach((t) => {
    if (t.parent_id && byId[t.parent_id]) byId[t.parent_id].children.push(byId[t.id]);
    else roots.push(byId[t.id]);
  });
  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function TopicNode({ node, depth, selectedSlug, expanded, toggle }) {
  const navigate = useNavigate();
  const isOpen = expanded.has(node.id);
  const selected = node.slug === selectedSlug;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: depth * 16 }}>
        {node.children.length > 0 ? (
          <button onClick={() => toggle(node.id)} aria-label={isOpen ? "Collapse" : "Expand"}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: c.faint, fontFamily: mono, fontSize: 11, width: 18, padding: 0 }}>
            {isOpen ? "▾" : "▸"}
          </button>
        ) : <span style={{ width: 18 }} />}
        <button onClick={() => navigate(`/topics/${node.slug}`)}
          style={{ flex: 1, textAlign: "left", cursor: "pointer", background: selected ? c.accentSoft : "transparent", border: "1px solid " + (selected ? c.accent : "transparent"), borderRadius: 6, padding: "7px 9px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: c.text }}>{node.name}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
            {node.verified_claims > 0 && (
              <span title={`${node.verified_claims} verified claims`}
                style={{ fontFamily: mono, fontSize: 10, color: c.accentText }}>{node.verified_claims}</span>
            )}
            {node.blog && (
              <span title={`Article: ${node.blog.status}`}
                style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[node.blog.status] || c.faint, display: "inline-block" }} />
            )}
          </span>
        </button>
      </div>
      {isOpen && node.children.map((ch) => (
        <TopicNode key={ch.id} node={ch} depth={depth + 1} selectedSlug={selectedSlug}
          expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

export default function TopicsView() {
  const { slug } = useParams();
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const [topics, setTopics] = useState(null);   // null = loading
  const [detail, setDetail] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/topics?include_counts=true").then((rows) => {
      setTopics(rows);
      setExpanded(new Set(rows.filter((t) => !t.parent_id).map((t) => t.id)));
    }).catch((e) => { setErr(e.message); setTopics([]); });
  }, []);

  useEffect(() => {
    if (!slug) { setDetail(null); return; }
    api(`/topics/${slug}`).then(setDetail).catch((e) => setErr(e.message));
  }, [slug]);

  // auto-expand ancestors of the selected topic
  useEffect(() => {
    if (!slug || !topics) return;
    const bySlug = Object.fromEntries(topics.map((t) => [t.slug, t]));
    const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
    let node = bySlug[slug];
    const toOpen = [];
    while (node?.parent_id && byId[node.parent_id]) {
      toOpen.push(node.parent_id);
      node = byId[node.parent_id];
    }
    if (toOpen.length) setExpanded((prev) => new Set([...prev, ...toOpen]));
  }, [slug, topics]);

  const tree = useMemo(() => (topics ? buildTree(topics) : []), [topics]);
  const toggle = (id) => setExpanded((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  if (topics === null) return null;
  if (!topics.length) {
    return (
      <Empty>
        No topics yet. Seed the topic tree with{" "}
        <Code>python scripts/import_content.py</Code> (reads content/topics.json).
      </Empty>
    );
  }

  const showTree = !isMobile || !slug;
  const showDetail = !!slug && !!detail;

  return (
    <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 18 }}>
      {err && <div style={{ color: c.red, fontSize: 13, gridColumn: "1 / -1" }}>{err}</div>}
      {showTree && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 10, alignSelf: "start", boxShadow: c.shadow }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, textTransform: "uppercase", letterSpacing: 0.6, padding: "4px 8px 8px" }}>Topics</div>
          {tree.map((node) => (
            <TopicNode key={node.id} node={node} depth={0} selectedSlug={slug}
              expanded={expanded} toggle={toggle} />
          ))}
        </div>
      )}
      {showDetail ? (
        <div>
          {isMobile && (
            <Link to="/topics" style={{ color: c.accentText, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "block", marginBottom: 10 }}>← All topics</Link>
          )}
          <div style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, padding: 18, boxShadow: c.shadow }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 650 }}>{detail.name}</span>
              {detail.capability_ids.map((id) => {
                const cap = CAPABILITIES.find((x) => x.id === id);
                return (
                  <Link key={id} to={`/registry?cap=${id}`} style={{ textDecoration: "none" }}>
                    <Chip color={c.accentText}>{cap?.name || id} →</Chip>
                  </Link>
                );
              })}
            </div>
            {detail.description && (
              <p style={{ color: c.muted, fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>{detail.description}</p>
            )}

            {/* the article */}
            {detail.blog ? (
              <Link to={`/blog/${detail.blog.slug}`} style={{ textDecoration: "none", display: "block", marginTop: 14 }}>
                <div style={{ border: "1px solid " + c.accentDim, borderRadius: 8, background: c.accentSoft, padding: "14px 16px", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5, color: c.text }}>{detail.blog.title}</span>
                    <Chip color={STATUS_COLORS[detail.blog.status] || c.muted}>{detail.blog.status}</Chip>
                    {detail.blog.ready_to_share && <Chip color={c.green}>✓ ready</Chip>}
                    {detail.blog.confidence != null && <Chip color={c.accentText}>{Math.round(detail.blog.confidence * 100)}%</Chip>}
                  </div>
                  {detail.blog.summary && <div style={{ fontSize: 13, color: c.muted, marginTop: 6, lineHeight: 1.55 }}>{detail.blog.summary}</div>}
                  <div style={{ fontFamily: mono, fontSize: 11, color: c.accentText, marginTop: 8 }}>Read the article →</div>
                </div>
              </Link>
            ) : (
              <div style={{ marginTop: 14 }}>
                <Empty>
                  No article for this topic yet. In Claude Code run{" "}
                  <Code>/publish-topic {detail.slug}</Code> — the blog-author composes a cited
                  article from verified claims only.
                </Empty>
              </div>
            )}

            {/* children */}
            {detail.children.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Drill further</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {detail.children.map((ch) => (
                    <Link key={ch.id} to={`/topics/${ch.slug}`} style={{ textDecoration: "none" }}>
                      <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel2, padding: "11px 13px", cursor: "pointer" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{ch.name}</div>
                        {ch.description && <div style={{ fontSize: 12, color: c.muted, marginTop: 4, lineHeight: 1.5 }}>{ch.description}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : !isMobile && (
        <Empty>
          Pick a topic to see its article, mapped capabilities, and sub-topics.
          Dots mark topics with a published article; numbers are verified claims behind it.
        </Empty>
      )}
    </div>
  );
}
