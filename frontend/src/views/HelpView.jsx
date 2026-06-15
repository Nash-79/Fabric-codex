import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Empty, Code } from "../components/ui.jsx";
import { Md } from "../components/Markdown.jsx";

/* Help pages are authored and kept current by the docs-author agent
   (content/help/*.md) — self-documentation grounded in the actual code,
   served statically by the backend. */
export default function HelpView() {
  const { page } = useParams();
  const navigate = useNavigate();
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const [files, setFiles] = useState(null);
  const [md, setMd] = useState("");

  useEffect(() => {
    api("/help").then((rows) => {
      setFiles(rows);
      if (!page && rows.length && !isMobile) navigate(`/help/${rows[0].name}`, { replace: true });
    }).catch(() => setFiles([]));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!page) { setMd(""); return; }
    fetch(`/content/help/${page}`)
      .then((r) => (r.ok ? r.text() : "Could not load this help page."))
      .then(setMd);
  }, [page]);

  if (files === null) return null;
  if (!files.length) {
    return (
      <Empty>
        No help pages yet. In Claude Code run <Code>/docs-sync</Code> — the docs-author agent
        writes self-documentation into <Code>content/help/</Code>, grounded in the actual code.
      </Empty>
    );
  }

  const showList = !isMobile || !page;
  const showDetail = !!page;

  return (
    <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 18 }}>
      {showList && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: 8, alignSelf: "start", boxShadow: c.shadow }}>
          {files.map((f) => {
            const active = f.name === page;
            return (
              <Link key={f.name} to={`/help/${f.name}`} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ borderRadius: 6, padding: "9px 11px", background: active ? c.accentSoft : "transparent", border: "1px solid " + (active ? c.accent : "transparent") }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: c.text }}>{f.title}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: c.faint, marginTop: 2 }}>{f.name}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {showDetail && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 10, background: c.panel, padding: isMobile ? 14 : "18px 24px", boxShadow: c.shadow }}>
          {isMobile && (
            <Link to="/help" style={{ color: c.accentText, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "block", marginBottom: 10 }}>← All help pages</Link>
          )}
          <Md text={md} />
        </div>
      )}
    </div>
  );
}
