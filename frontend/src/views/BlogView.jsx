import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { TIER_COLORS, TIER_LABELS } from "../lib/constants.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Empty } from "../components/ui.jsx";
import { Md } from "../components/Markdown.jsx";

const STATUS_COLORS = { validated: c.green, checked: c.amber, draft: c.amber, needs_review: c.red };

function tocFromMarkdown(md) {
  const items = [];
  let inCode = false;
  for (const line of (md || "").split("\n")) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.*)/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/\[S\d+\]/g, "").trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    items.push({ level: m[1].length, text, id });
  }
  return items;
}

export default function BlogView() {
  const { slug } = useParams();
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const [blog, setBlog] = useState(null);
  const [history, setHistory] = useState(null);
  const [topic, setTopic] = useState(null);
  const [err, setErr] = useState("");
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [highlightedSource, setHighlightedSource] = useState(null);

  useEffect(() => {
    setBlog(null);
    setHistory(null);
    setTopic(null);
    setErr("");
    setSourcesExpanded(false);
    setHighlightedSource(null);
    api(`/blogs/${slug}`)
      .then((b) => {
        setBlog(b);
        api("/topics")
          .then((rows) => setTopic(rows.find((t) => t.id === b.topic_id) || null))
          .catch(() => {});
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  const handleCiteClick = (tag) => {
    setSourcesExpanded(true);
    setHighlightedSource(tag);
    setTimeout(() => {
      const el = document.getElementById(`source-${tag}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    setTimeout(() => {
      setHighlightedSource(null);
    }, 2500);
  };

  if (err) return <Empty>{err}</Empty>;
  if (!blog) return null;

  const toc = tocFromMarkdown(blog.body_md);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* breadcrumb */}
      <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 12 }}>
        <Link to="/topics" style={{ color: c.faint, textDecoration: "none" }}>
          Topics
        </Link>
        {topic && (
          <>
            {" "}
            /{" "}
            <Link to={`/topics/${topic.slug}`} style={{ color: c.accentText, textDecoration: "none" }}>
              {topic.name}
            </Link>
          </>
        )}
      </div>

      {/* Header and Summary Area */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25, margin: "0 0 10px", color: c.text }}>
          {blog.title}
        </h1>
        
        {isMobile && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Chip color={STATUS_COLORS[blog.status] || c.muted}>{blog.status}</Chip>
            {blog.ready_to_share && <Chip color={c.green}>✓ validated & ready</Chip>}
            {blog.confidence != null && (
              <Chip color={c.accentText}>confidence {Math.round(blog.confidence * 100)}%</Chip>
            )}
            <Chip color={c.faint}>v{blog.version}</Chip>
            {(blog.depth_levels || []).length > 0 && (
              <Chip color={c.accentText}>L{blog.depth_levels.join("–L")}</Chip>
            )}
            {(blog.tags || []).map((t) => (
              <Chip key={t} color={c.accentText}>
                #{t}
              </Chip>
            ))}
          </div>
        )}

        {blog.summary && (
          <p style={{ fontSize: 15, lineHeight: 1.65, color: c.muted, margin: "0 0 14px", maxWidth: 840 }}>
            {blog.summary}
          </p>
        )}
      </div>

      {/* drift / status banner */}
      {blog.status === "needs_review" && (
        <div
          style={{
            border: "1px solid " + c.red,
            borderRadius: 8,
            background: c.red + "14",
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: c.text,
          }}
        >
          <strong style={{ color: c.red }}>Sources behind this article changed.</strong> It is
          pending re-validation — treat its statements with care until a new validation pass runs.
        </div>
      )}

      {/* Two-Column Responsive Grid Layout */}
      <div
        style={
          isMobile
            ? {}
            : {
                display: "grid",
                gridTemplateColumns: "1fr 310px",
                gap: 28,
                alignItems: "start",
              }
        }
      >
        {/* Left Column: Article Body */}
        <div style={{ display: "grid", gap: 20 }}>
          <div
            style={{
              border: "1px solid " + c.line,
              borderRadius: 10,
              background: c.panel,
              padding: isMobile ? "16px 16px" : "24px 32px",
              boxShadow: c.shadow,
            }}
          >
            <Md text={blog.body_md} legend={blog.legend} onCiteClick={handleCiteClick} />
          </div>
        </div>

        {/* Right Column: Sidebar */}
        <div
          style={
            isMobile
              ? { marginTop: 20, display: "grid", gap: 16 }
              : { position: "sticky", top: 20, display: "grid", gap: 18 }
          }
        >
          {/* Article Info (Desktop only) */}
          {!isMobile && (
            <div
              style={{
                border: "1px solid " + c.line,
                borderRadius: 8,
                background: c.panel,
                padding: "14px 16px",
                boxShadow: c.shadow,
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  color: c.faint,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 10,
                }}
              >
                Article Info
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: c.muted }}>Status</span>
                  <Chip color={STATUS_COLORS[blog.status] || c.muted}>{blog.status}</Chip>
                </div>
                {blog.confidence != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: c.muted }}>Confidence</span>
                    <Chip color={c.accentText}>{Math.round(blog.confidence * 100)}%</Chip>
                  </div>
                )}
                {blog.ready_to_share && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: c.muted }}>Validation</span>
                    <Chip color={c.green}>✓ validated</Chip>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: c.muted }}>Version</span>
                  <Chip color={c.faint}>v{blog.version}</Chip>
                </div>
                {(blog.depth_levels || []).length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: c.muted }}>Depth Level</span>
                    <Chip color={c.accentText}>L{blog.depth_levels.join("–L")}</Chip>
                  </div>
                )}
                {(blog.tags || []).length > 0 && (
                  <div style={{ marginTop: 6, borderTop: "1px solid " + c.lineSoft, paddingTop: 10 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {blog.tags.map((t) => (
                        <Chip key={t} color={c.accentText}>
                          #{t}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table of Contents */}
          {toc.length > 1 && (
            <div
              style={{
                border: "1px solid " + c.line,
                borderRadius: 8,
                background: c.panel,
                padding: "14px 16px",
                boxShadow: c.shadow,
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  color: c.faint,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 8,
                }}
              >
                On this page
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                {toc.map((item, i) => (
                  <a
                    key={i}
                    href={`#${item.id}`}
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: c.accentText,
                      textDecoration: "none",
                      padding: "4px 0",
                      paddingLeft: (item.level - 2) * 12,
                      transition: "color 0.15s ease",
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => (e.target.style.color = c.accentStrong)}
                    onMouseLeave={(e) => (e.target.style.color = c.accentText)}
                  >
                    {item.text}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible Sources Cited */}
          {(blog.legend || []).length > 0 && (
            <div
              style={{
                border: "1px solid " + c.line,
                borderRadius: 8,
                background: c.panel,
                padding: "14px 16px",
                boxShadow: c.shadow,
                transition: "all 0.2s ease",
              }}
            >
              <button
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 0,
                  fontFamily: mono,
                  fontSize: 11,
                  color: c.faint,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                <span>Sources cited ({blog.legend.length})</span>
                <span
                  style={{
                    fontSize: 12,
                    transition: "transform 0.2s ease",
                    transform: sourcesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  ▾
                </span>
              </button>

              <div
                style={{
                  maxHeight: sourcesExpanded ? 1200 : 0,
                  opacity: sourcesExpanded ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-top 0.2s ease",
                  marginTop: sourcesExpanded ? 12 : 0,
                }}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  {blog.legend.map((s) => {
                    const isHighlighted = highlightedSource === s.tag;
                    return (
                      <div
                        key={s.tag}
                        id={`source-${s.tag}`}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: isHighlighted ? c.accentSoft : "transparent",
                          border: "1px solid " + (isHighlighted ? c.accent : "transparent"),
                          transition: "background-color 0.3s ease, border-color 0.3s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <Chip color={isHighlighted ? c.accent : c.accentText}>{s.tag}</Chip>
                          <Chip color={TIER_COLORS[s.tier]}>{`T${s.tier} · ${TIER_LABELS[s.tier] || ""}`}</Chip>
                          {!s.active && <Chip color={c.red}>superseded</Chip>}
                        </div>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 12.5,
                              color: c.text,
                              textDecorationColor: c.accentDim,
                              fontWeight: 500,
                              lineHeight: 1.4,
                            }}
                          >
                            {s.title}
                          </a>
                        ) : (
                          <span style={{ fontSize: 12.5, color: c.text, fontWeight: 500, lineHeight: 1.4 }}>
                            {s.title}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Version History */}
          <div
            style={{
              border: "1px solid " + c.line,
              borderRadius: 8,
              background: c.panel,
              padding: "10px 14px",
              boxShadow: c.shadow,
            }}
          >
            <button
              onClick={async () => setHistory(history ? null : await api(`/blogs/${slug}/history`))}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 0,
                fontFamily: mono,
                fontSize: 11,
                color: c.faint,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              <span>Version history</span>
              <span
                style={{
                  fontSize: 12,
                  transition: "transform 0.2s ease",
                  transform: history ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                ▾
              </span>
            </button>

            {history && (
              <div
                style={{
                  marginTop: 10,
                  borderTop: "1px solid " + c.lineSoft,
                  paddingTop: 8,
                  display: "grid",
                  gap: 8,
                }}
              >
                {history.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      background: c.panel2,
                      opacity: h.active ? 1 : 0.6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Chip color={h.active ? c.green : c.faint}>v{h.version}</Chip>
                      <span style={{ fontFamily: mono, fontSize: 9, color: c.faint }}>
                        {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span style={{ fontSize: 11.5, color: c.muted, fontWeight: 500 }}>{h.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
