## Goal
Make the browser chrome (mobile address bar, PWA UI) match the active Fabric Atlas theme, and let the app follow the OS color scheme by default while still honoring an explicit user choice.

## Changes

### 1. `src/routes/__root.tsx` — theme-color meta + pre-paint script
- Add two `theme-color` meta tags in the root `head()`, scoped by `media`:
  - `{ name: "theme-color", media: "(prefers-color-scheme: light)", content: "#faf9f8" }`
  - `{ name: "theme-color", media: "(prefers-color-scheme: dark)",  content: "#141414" }`
  These match the `--background` tokens in `src/styles.css` and are what Chrome/Safari use for the address bar tint.
- Update the pre-paint inline script in `RootShell` so first paint already reflects the resolved theme:
  - Read `localStorage.getItem('fa.theme')` → may be `"light"`, `"dark"`, or `"system"` (new), or missing.
  - If missing or `"system"`, resolve via `matchMedia('(prefers-color-scheme: dark)').matches`.
  - Toggle `.dark` on `<html>` and set `dataset.theme` accordingly.
- Keep `suppressHydrationWarning` on `<html>` (already present).

### 2. `src/components/ThemeToggle.tsx` — system mode + live OS sync
- Extend the type: `type Theme = "light" | "dark" | "system"`. Default to `"system"` on first load (no stored value).
- Replace the binary button with a 3-way control (Sun / Moon / Monitor icons) using existing button styles, or a cycling button that rotates `light → dark → system → light`. Either is fine; cycling button keeps the header compact (preferred).
- On mount: hydrate from `localStorage`; if no value or `"system"`, apply the OS preference.
- Subscribe to `window.matchMedia('(prefers-color-scheme: dark)')` `change` events while `theme === "system"` so the UI flips live when the OS toggles (e.g., macOS auto night). Unsubscribe when the user picks an explicit mode.
- Helper `applyResolvedTheme(theme)` resolves `"system"` to the current OS preference, sets `.dark` class + `dataset.theme`, and writes the chosen mode to `localStorage` (keeps `"system"` as a literal string so the choice survives reloads).
- aria-label and `title` reflect the current mode and the next mode the button will switch to.

### 3. No changes to `src/styles.css`
The existing `:root` / `.dark` token blocks already drive both palettes; only the trigger logic changes.

## Notes for the user
- The mobile browser address bar will tint cream in light mode and near-black in dark mode automatically.
- First-load default is now the OS preference; an explicit Light/Dark choice persists across visits until the user picks "System" again.
