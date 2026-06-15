import React, { useState, useEffect } from "react";
import { c, mono } from "../theme.js";
import { api } from "../lib/api.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Btn, Empty, Code } from "../components/ui.jsx";
import { Md } from "../components/Markdown.jsx";

/* Lessons are authored by the learning-author agent into content/lessons/
   (grounded in verified claims only) and served statically by the backend.
   This view lists and renders them. */
export default function LearnView() {
  const w = useWindowWidth();
  const isMobile = w < MOBILE;
  const [files, setFiles] = useState(null);   // null = loading
  const [open, setOpen] = useState(null);     // { name, md }
  useEffect(() => {
    api("/lessons/files").then(setFiles).catch(() => setFiles([]));
  }, []);

  const view = async (f) => {
    const res = await fetch("/" + f.path.replace(/^\//, ""));
    setOpen({ name: f.name, md: res.ok ? await res.text() : "Could not load lesson." });
  };
  const closeLesson = () => setOpen(null);

  if (files === null) return null;
  if (!files.length) {
    return (
      <Empty>
        No lessons yet. Verify claims in the Registry, then in Claude Code run{" "}
        <Code>/lesson &lt;capability&gt; &lt;Beginner|Intermediate|Expert&gt;</Code> —
        lessons are grounded only in approved claims (Beginner=L1–L2, Intermediate=L3, Expert=L4–L5).
      </Empty>
    );
  }

  // On mobile: show list OR lesson (never both simultaneously)
  const showList = !isMobile || !open;
  const showDetail = !!open;

  return (
    <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: open ? "minmax(240px, 300px) 1fr" : "1fr", gap: 16 }}>
      {showList && (
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {files.map((f) => (
            <button key={f.name} onClick={() => view(f)} style={{ textAlign: "left", cursor: "pointer", background: open?.name === f.name ? c.accentSoft : c.panel, border: "1px solid " + (open?.name === f.name ? c.accent : c.line), borderRadius: 8, padding: 12, boxShadow: c.shadow }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: c.text }}>{f.name.replace(/\.md$/, "").replace(/-/g, " ")}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: c.faint, marginTop: 4 }}>{f.path}</div>
            </button>
          ))}
        </div>
      )}
      {showDetail && (
        <div style={{ border: "1px solid " + c.line, borderRadius: 8, background: c.panel, padding: isMobile ? 14 : 18, boxShadow: c.shadow }}>
          {isMobile && (
            <button onClick={closeLesson} style={{ background: "transparent", border: "none", color: c.accentText, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "0 0 12px", display: "block" }}>← Back to lessons</button>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{open.name}</span>
            {!isMobile && <Btn small onClick={closeLesson}>Close</Btn>}
          </div>
          <Md text={open.md} />
        </div>
      )}
    </div>
  );
}
