import React from "react";
import { c, BRAND, sans, mono } from "../theme.js";

export const Chip = ({ children, color = c.muted, bg = "transparent" }) => (
  <span style={{ fontFamily: mono, fontSize: 11, color, background: bg, border: "1px solid " + (bg === "transparent" ? c.line : "transparent"), borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{children}</span>
);

export const Btn = ({ children, onClick, primary, small, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ fontFamily: sans, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, color: primary ? c.onAccent : c.text, background: primary ? c.accent : c.panel, border: "1px solid " + (primary ? c.accent : c.line), borderRadius: 4, padding: small ? "5px 12px" : "8px 16px", boxShadow: c.shadow }}>{children}</button>
);

let _cdStyleDone = false;
const ensureCountdownStyle = () => {
  if (_cdStyleDone || typeof document === "undefined") return;
  _cdStyleDone = true;
  const el = document.createElement("style");
  el.textContent = "@keyframes cd-shrink{from{width:100%}to{width:0%}}";
  document.head.appendChild(el);
};

export const CountdownBtn = ({ children, onClick, primary, small, disabled, countdown }) => {
  ensureCountdownStyle();
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={onClick} disabled={disabled} style={{ fontFamily: sans, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, color: primary ? c.onAccent : c.text, background: primary ? c.accent : c.panel, border: "1px solid " + (primary ? c.accent : c.line), borderRadius: 4, padding: small ? "5px 12px" : "8px 16px", boxShadow: c.shadow, display: "block" }}>{children}</button>
      {countdown && (
        <div key={String(countdown)} style={{ position: "absolute", bottom: 0, left: 0, height: 3, borderRadius: "0 0 4px 4px", background: primary ? "rgba(255,255,255,0.65)" : c.accent, animation: "cd-shrink 3s linear forwards", pointerEvents: "none" }} />
      )}
    </div>
  );
};

export const Empty = ({ children }) => (
  <div style={{ border: "1px dashed " + c.line, borderRadius: 8, padding: 24, textAlign: "center", color: c.muted, fontSize: 13, lineHeight: 1.6, background: c.panel }}>{children}</div>
);

export const Code = ({ children }) => (
  <code style={{ fontFamily: mono, fontSize: 12, color: c.accentText, background: c.accentSoft, borderRadius: 4, padding: "1px 5px" }}>{children}</code>
);

/* Original Fabric Atlas mark — woven layers in the Fabric brand ramp.
   Deliberately NOT Microsoft's Fabric icon: Microsoft's icon terms do not
   allow product icons to represent third-party apps, so this is our own
   geometry using the same palette. */
export const AtlasMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Fabric Atlas" role="img">
    <defs>
      <linearGradient id="fa-g1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.pine} />
        <stop offset="0.55" stopColor={BRAND.teal} />
        <stop offset="1" stopColor={BRAND.jade} />
      </linearGradient>
      <linearGradient id="fa-g2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.jade} />
        <stop offset="1" stopColor={BRAND.mint} />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#fa-g1)" />
    <path d="M7 21.5 16 17l9 4.5L16 26z" fill={BRAND.ink} opacity="0.55" />
    <path d="M7 16.5 16 12l9 4.5L16 21z" fill="url(#fa-g2)" opacity="0.9" />
    <path d="M7 11.5 16 7l9 4.5L16 16z" fill="#E9FFF8" opacity="0.95" />
  </svg>
);
