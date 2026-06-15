/* Fabric Atlas theme — Microsoft Fabric / Fluent 2 design language.
 *
 * Brand colors are sampled from the official Microsoft Fabric product icon
 * (npm: @fabric-msft/svg-icons, fabric_48_color.svg) — the teal ramp around
 * #117865 is the same brand ramp the Fabric portal uses. Neutrals follow the
 * Fluent UI gray ramp. Light is the default (matching the Fabric portal);
 * dark is a first-class toggle.
 *
 * Every component styles against `c.<token>`, which resolves to a CSS custom
 * property (var(--token)). applyTheme() flips all tokens at once on <html>,
 * so adding a theme or changing a color never touches component code.
 * To extend: add the token to BOTH maps in `themes`, then use c.<token>.
 */

// Raw brand ramp from the Fabric product icon — for gradients and the mark.
export const BRAND = {
  mint: "#25FFD4",
  seafoam: "#60E9D0",
  spring: "#ABE88E",
  jade: "#2AAC94",
  teal: "#117865",
  tealDark: "#0E6961",
  pine: "#085954",
  ink: "#063D3B",
  cyan: "#6AD6F9",
};

export const themes = {
  light: {
    bg: "#FAF9F8", panel: "#FFFFFF", panel2: "#F3F2F1",
    line: "#E1DFDD", lineSoft: "#EDEBE9",
    text: "#242424", muted: "#616161", faint: "#8A8886",
    accent: "#117865", accentStrong: "#0E6961", accentDim: "#9AD2C5",
    accentSoft: "rgba(17,120,101,0.08)", accentText: "#0B5E50",
    onAccent: "#FFFFFF",
    green: "#107C10", amber: "#9D5D00", red: "#C50F1F",
    tier1: "#107C10", tier2: "#0F6CBD", tier3: "#4F6BED",
    tier4: "#9D5D00", tier5: "#CA5010", tier6: "#8A8886",
    shadow: "0 1.6px 3.6px rgba(0,0,0,0.07), 0 0.3px 0.9px rgba(0,0,0,0.05)",
    heroFrom: "#063D3B", heroVia: "#0B5E50", heroTo: "#1D8E79",
    diagramBg: "#FFFFFF",
  },
  dark: {
    bg: "#141414", panel: "#1F1E1D", panel2: "#292827",
    line: "#3B3A39", lineSoft: "#323130",
    text: "#F3F2F1", muted: "#A19F9D", faint: "#797775",
    accent: "#2AAC94", accentStrong: "#60E9D0", accentDim: "#0E6961",
    accentSoft: "rgba(42,172,148,0.12)", accentText: "#7FE0CB",
    onAccent: "#063D3B",
    green: "#54B054", amber: "#E3A008", red: "#F1707B",
    tier1: "#54B054", tier2: "#479EF5", tier3: "#7F85F5",
    tier4: "#E3A008", tier5: "#DB7500", tier6: "#797775",
    shadow: "0 1.6px 3.6px rgba(0,0,0,0.32), 0 0.3px 0.9px rgba(0,0,0,0.28)",
    heroFrom: "#04302E", heroVia: "#0B5E50", heroTo: "#1D8E79",
    diagramBg: "#FFFFFF",
  },
};

// Inline-style token map: c.bg === "var(--bg)" etc.
export const c = Object.fromEntries(
  Object.keys(themes.light).map((k) => [k, `var(--${k})`])
);

export const sans =
  "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif";
export const mono =
  "'Cascadia Code', Consolas, ui-monospace, SFMono-Regular, Menlo, monospace";

export function applyTheme(mode) {
  const t = themes[mode] || themes.light;
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  document.body.style.background = t.bg;
  try {
    localStorage.setItem("fabric-atlas-theme", mode);
  } catch {
    /* private mode — theme just won't persist */
  }
}

export function initialTheme() {
  try {
    const saved = localStorage.getItem("fabric-atlas-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* noop */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
