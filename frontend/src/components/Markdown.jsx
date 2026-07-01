import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { c, sans, mono } from "../theme.js";

/* Full GFM rendering (tables, code, links, nested lists) via react-markdown,
   themed with the same tokens as the rest of the UI. [Sn] citations anywhere
   in text are rendered as chips. */
export const CiteChip = ({ tag, title, onClick }) => (
  <span
    title={title}
    onClick={onClick}
    style={{
      fontFamily: mono,
      fontSize: 11,
      color: c.accentText,
      background: c.accentSoft,
      border: "1px solid " + c.accentDim,
      borderRadius: 4,
      padding: "0 4px",
      margin: "0 1px",
      cursor: onClick || title ? "pointer" : "inherit",
    }}
  >
    {tag}
  </span>
);

function makeCite(legendByTag, onCiteClick) {
  return function cite(children) {
    return React.Children.map(children, (child) =>
      typeof child === "string"
        ? child.split(/(\[S\d+\])/g).map((p, i) => {
            if (!/^\[S\d+\]$/.test(p)) return p;
            const tag = p.slice(1, -1);
            const src = legendByTag?.[tag];
            return (
              <CiteChip
                key={i}
                tag={tag}
                title={src ? `${src.title} (T${src.tier})` : undefined}
                onClick={onCiteClick ? () => onCiteClick(tag) : undefined}
              />
            );
          })
        : child,
    );
  };
}

const heading =
  (cite, size, upper = false) =>
  ({ children }) => {
    const text = React.Children.toArray(children)
      .filter((x) => typeof x === "string")
      .join(" ");
    const id = text
      ? text
          .toLowerCase()
          .replace(/\[s\d+\]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      : undefined;
    return (
      <div
        id={id}
        style={{
          color: c.accentText,
          fontFamily: sans,
          fontWeight: 600,
          fontSize: size,
          letterSpacing: upper ? 0.3 : 0,
          textTransform: upper ? "uppercase" : "none",
          margin: "18px 0 6px",
        }}
      >
        {cite(children)}
      </div>
    );
  };

function buildComponents(legendByTag, onCiteClick) {
  const cite = makeCite(legendByTag, onCiteClick);
  return {
    h1: heading(cite, 16),
    h2: heading(cite, 13, true),
    h3: heading(cite, 13, true),
    h4: heading(cite, 12.5, true),
    h5: heading(cite, 12.5, true),
    h6: heading(cite, 12.5, true),
    p: ({ children }) => (
      <p style={{ color: c.text, lineHeight: 1.6, margin: "6px 0" }}>{cite(children)}</p>
    ),
    ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ol>,
    li: ({ children }) => (
      <li style={{ color: c.text, lineHeight: 1.55, marginBottom: 4 }}>{cite(children)}</li>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: c.accentText, textDecorationColor: c.accentDim }}
      >
        {children}
      </a>
    ),
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: "100%",
          borderRadius: 6,
          background: c.diagramBg,
          border: "1px solid " + c.lineSoft,
          margin: "8px 0",
        }}
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    ),
    code: ({ children }) => (
      <code
        style={{
          fontFamily: mono,
          fontSize: 12,
          color: c.accentText,
          background: c.accentSoft,
          borderRadius: 4,
          padding: "1px 5px",
        }}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre
        style={{
          fontFamily: mono,
          fontSize: 12,
          color: c.text,
          background: c.panel2,
          border: "1px solid " + c.lineSoft,
          borderRadius: 6,
          padding: "10px 12px",
          overflowX: "auto",
          lineHeight: 1.5,
        }}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          margin: "8px 0",
          padding: "2px 14px",
          borderLeft: "3px solid " + c.accentDim,
          color: c.muted,
        }}
      >
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div style={{ overflowX: "auto", margin: "10px 0" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th
        style={{
          textAlign: "left",
          padding: "6px 10px",
          borderBottom: "2px solid " + c.line,
          color: c.accentText,
          fontWeight: 600,
        }}
      >
        {cite(children)}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid " + c.lineSoft,
          verticalAlign: "top",
          color: c.text,
        }}
      >
        {cite(children)}
      </td>
    ),
    hr: () => <hr style={{ border: "none", borderTop: "1px solid " + c.line, margin: "14px 0" }} />,
  };
}

/* legend: optional [{tag:"S1", title, tier}] — when supplied, [Sn] chips show
   the source title on hover. */
export function Md({ text, legend, onCiteClick }) {
  if (!text) return null;
  const legendByTag = legend ? Object.fromEntries(legend.map((s) => [s.tag, s])) : null;
  const components = buildComponents(legendByTag, onCiteClick);
  return (
    <div style={{ fontSize: 13 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
