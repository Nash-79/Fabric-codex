import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "fa.theme";
const LEGACY_KEY = "fa-theme";

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

function applyTheme(theme: Theme) {
  const resolved = resolve(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.dataset.themeChoice = theme;
}

/**
 * Cycling theme control: system → light → dark → system.
 * Persists the user's *choice* (including "system") to localStorage and live-
 * follows the OS preference while in system mode. Defaults to system on first
 * load so the app matches the user's OS color scheme out of the gate.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  // Hydrate from storage on mount (client only).
  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* storage unavailable */
    }
    setTheme(stored);
    applyTheme(stored);
  }, []);

  // While in system mode, follow live OS changes (e.g. macOS auto night).
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function cycle() {
    const order: Theme[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  const labelFor: Record<Theme, string> = {
    system: "Theme: system (follows OS). Click for light.",
    light: "Theme: light. Click for dark.",
    dark: "Theme: dark. Click for system.",
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={labelFor[theme]}
      title={labelFor[theme]}
      className="no-print inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
