import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

/**
 * Light/dark toggle. Persists to localStorage and applies a `.dark` class on
 * <html> (the token system in styles.css already defines both palettes).
 * Defaults to dark — the app's established look — so existing pages are unchanged
 * until the user opts into light.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Hydrate from storage on mount (client only).
  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" &&
      localStorage.getItem("fa-theme")) as Theme | null;
    const initial: Theme = stored === "light" || stored === "dark" ? stored : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("fa-theme", next);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="no-print inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/65 transition hover:bg-white/5 hover:text-white"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
