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

  useEffect(() => {
    setBlog(null);
    setHistory(null);
    setTopic(null);
    setErr("");
    api(`/blogs/${slug}`)
      .then((b) => {
        setBlog(b);
        api("/topics")
          .then((rows) => setTopic(rows.find((t) => t.id === b.topic_id) || null))
          .catch(() => {});
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  if (err) return <Empty>{err}</Empty>;
  if (!blog) return null;

  const toc = tocFromMarkdown(blog.body_md);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* breadcrumb */}
      <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginBottom: 10 }}>
        <Link to="/topics" style={{ color: c.faint }}>
          Topics
        </Link>
        {topic && (
          <>
            {" "}
            /{" "}
            <Link to={`/topics/${topic.slug}`} style={{ color: c.accentText }}>
              {topic.name}
            </Link>
          </>
        )}
      </div>

      {/* drift / status banner */}
      {blog.status === "needs_review" && (
        <div
          style={{
            border: "1px solid " + c.red,
            borderRadius: 8,
            background: c.red + "14",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            color: c.text,
          }}
        >
          <strong style={{ color: c.red }}>Sources behind this article changed.</strong> It is
          pending re-validation — treat its statements with care until a new validation pass runs.
        </div>
      )}

      <h1 style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.25, margin: "0 0 8px" }}>
        {blog.title}
      </h1>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
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
      {blog.summary && (
        <p style={{ fontSize: 14.5, lineHeight: 1.65, color: c.muted, margin: "0 0 14px" }}>
          {blog.summary}
        </p>
      )}

      {/* table of contents */}
      {toc.length > 1 && (
        <div
          style={{
            border: "1px solid " + c.line,
            borderRadius: 8,
            background: c.panel2,
            padding: "10px 16px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 11,
              color: c.faint,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            On this page
          </div>
          {toc.map((item, i) => (
            <a
              key={i}
              href={`#${item.id}`}
              style={{
                display: "block",
                fontSize: 12.5,
                color: c.accentText,
                textDecoration: "none",
                padding: "2px 0",
                paddingLeft: (item.level - 2) * 14,
              }}
            >
              {item.text}
            </a>
          ))}
        </div>
      )}

      {/* article body — [Sn] chips resolve to the source legend on hover */}
      <div
        style={{
          border: "1px solid " + c.line,
          borderRadius: 10,
          background: c.panel,
          padding: isMobile ? "16px 16px" : "22px 28px",
          boxShadow: c.shadow,
        }}
      >
        <Md text={blog.body_md} legend={blog.legend} />
      </div>

      {/* source legend */}
      {(blog.legend || []).length > 0 && (
        <div
          style={{
            border: "1px solid " + c.line,
            borderRadius: 10,
            background: c.panel,
            padding: "14px 18px",
            marginTop: 16,
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
            Sources cited
          </div>
          {blog.legend.map((s) => (
            <div
              key={s.tag}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                padding: "5px 0",
                flexWrap: "wrap",
              }}
            >
              <Chip color={c.accentText}>{s.tag}</Chip>
              <Chip color={TIER_COLORS[s.tier]}>{`T${s.tier} · ${TIER_LABELS[s.tier] || ""}`}</Chip>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, color: c.text, textDecorationColor: c.accentDim }}
                >
                  {s.title}
                </a>
              ) : (
                <span style={{ fontSize: 13, color: c.text }}>{s.title}</span>
              )}
              {!s.active && <Chip color={c.red}>superseded</Chip>}
            </div>
          ))}
        </div>
      )}

      {/* version history */}
      <div style={{ marginTop: 14, textAlign: "right" }}>
        <button
          onClick={async () => setHistory(history ? null : await api(`/blogs/${slug}/history`))}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: mono,
            fontSize: 11,
            color: c.faint,
            textDecoration: "underline",
          }}
        >
          {history ? "hide version history" : "version history"}
        </button>
      </div>
      {history && (
        <div
          style={{
            border: "1px solid " + c.line,
            borderRadius: 8,
            background: c.panel,
            marginTop: 6,
          }}
        >
          {history.map((h) => (
            <div
              key={h.id}
              style={{
                padding: "9px 14px",
                borderBottom: "1px solid " + c.lineSoft,
                opacity: h.active ? 1 : 0.55,
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                flexWrap: "wrap",
              }}
            >
              <Chip color={h.active ? c.green : c.faint}>v{h.version}</Chip>
              <Chip>{h.status}</Chip>
              <span style={{ fontSize: 12.5, color: c.muted }}>{h.title}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: c.faint, marginLeft: "auto" }}>
                {new Date(h.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
