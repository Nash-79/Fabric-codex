import React, { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { c, sans, applyTheme, initialTheme } from "../theme.js";
import { api } from "../lib/api.js";
import { useWindowWidth, MOBILE } from "../lib/useWindowWidth.js";
import { Chip, Empty, Code, AtlasMark } from "./ui.jsx";

export const NAV = [
  ["/", "Overview"],
  ["/topics", "Topics"],
  ["/search", "Search"],
  ["/registry", "Registry"],
  ["/sources", "Sources"],
  ["/designs", "Designs"],
  ["/learn", "Learn"],
  ["/help", "Help"],
  ["/author", "Author"],
];

export default function Layout() {
  const [health, setHealth] = useState("checking");
  const [theme, setTheme] = useState(initialTheme);
  const w = useWindowWidth();
  const isMobile = w < MOBILE;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    api("/health")
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, []);

  return (
    <div style={{ fontFamily: sans, background: c.bg, color: c.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "0 12px" : "0 20px" }}>
        {/* Header — stacks vertically on mobile */}
        <div
          style={{
            padding: isMobile ? "12px 0 10px" : "16px 0 12px",
            borderBottom: "1px solid " + c.line,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 8 : 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <AtlasMark />
            <div>
              <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 600 }}>
                Fabric Atlas
                <span style={{ fontWeight: 400, color: c.muted, fontSize: 13, marginLeft: 8 }}>
                  for Microsoft Fabric
                </span>
              </div>
              {!isMobile && (
                <div style={{ color: c.muted, fontSize: 12 }}>
                  Governed knowledge → grounded architecture
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Chip color={health === "ok" ? c.green : health === "down" ? c.red : c.muted}>
              backend{" "}
              {health === "ok"
                ? "● connected"
                : health === "down"
                  ? isMobile
                    ? "● down"
                    : "● unreachable — run uvicorn"
                  : "…"}
            </Chip>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={"Switch to " + (theme === "light" ? "dark" : "light") + " theme"}
              style={{
                cursor: "pointer",
                background: c.panel,
                color: c.muted,
                border: "1px solid " + c.line,
                borderRadius: 4,
                padding: "4px 10px",
                fontFamily: sans,
                fontSize: 12,
                minHeight: 30,
              }}
            >
              {theme === "light" ? "◑ Dark" : "◐ Light"}
            </button>
          </div>
        </div>
        {/* Nav bar — horizontally scrollable, touch-friendly on mobile */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid " + c.line,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              style={({ isActive }) => ({
                fontFamily: sans,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                textDecoration: "none",
                color: isActive ? c.text : c.muted,
                borderBottom: "2.5px solid " + (isActive ? c.accent : "transparent"),
                padding: isMobile ? "12px 12px" : "12px 14px",
                marginBottom: -1,
                whiteSpace: "nowrap",
                minHeight: 44,
                display: "flex",
                alignItems: "center",
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div style={{ padding: isMobile ? "16px 0 40px" : "20px 0 60px" }}>
          {health === "down" ? (
            <Empty>
              Backend is not running. Start it first:
              <br />
              <Code>
                cd backend &amp;&amp; .venv\Scripts\activate &amp;&amp; uvicorn app.main:app
                --reload
              </Code>
            </Empty>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  );
}
