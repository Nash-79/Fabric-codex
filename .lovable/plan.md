## Goal
A branded launch experience when Fabric Atlas is opened from a home-screen shortcut on iPhone/iPad, Android, and desktop PWA installs — matching the teal icon rather than showing a blank white flash.

## What's already in place
- `public/manifest.webmanifest` with `background_color: #0d5c5c`, `theme_color: #0d5c5c`, and 192/512 icons. On **Android and desktop Chrome/Edge/Safari-macOS**, this is exactly what the OS uses to compose the splash (teal background + centered maskable icon + app name). No extra work needed for those platforms.
- Apple touch icon + `apple-mobile-web-app-capable` meta are set. iOS *does* respect those for the home-screen icon, but for the launch/splash screen it uses `apple-touch-startup-image` with strict per-device media queries. Without them, iOS shows a plain white screen for ~1s.

## What to build (iOS launch images)

Generate one branded 2732×2732 source artwork — teal gradient background (#0d5c5c → #14b8a6) with the centered "F" ribbon mark (same as `apple-touch-icon.png`) and "Fabric Atlas" wordmark below.

From that source, produce the standard Apple launch-image PNG set (portrait + landscape) covering all currently supported iPhone/iPad classes. Each PNG is a center-cropped/padded version on the teal background so the icon stays visually centered at every aspect ratio:

Portrait (device px × device px, 1x device-pixel-ratio applied):
- 2048×2732 (12.9" iPad Pro)
- 1668×2388 (11" iPad Pro / iPad Air)
- 1640×2360 (iPad Air 10.9")
- 1620×2160 (iPad 10.2")
- 1536×2048 (iPad Mini / iPad 9.7")
- 1284×2778 (iPhone 14/15 Pro Max, 12/13 Pro Max)
- 1170×2532 (iPhone 14/15, 12/13)
- 1125×2436 (iPhone X/XS/11 Pro)
- 1242×2688 (iPhone XS Max/11 Pro Max)
- 828×1792 (iPhone XR/11)
- 750×1334 (iPhone 8/SE 2nd/3rd gen)

Landscape: matching set (dimensions swapped).

Files go under `public/splash/` as `apple-splash-{width}x{height}.png`.

## Wiring

Add `apple-touch-startup-image` link tags in `src/routes/__root.tsx` `head().links`, one per size, each with the exact iOS media query (`screen and (device-width: Xpx) and (device-height: Ypx) and (-webkit-device-pixel-ratio: N) and (orientation: portrait|landscape)`). These are the standard queries Apple published — I'll include the full generated set inline.

Also add `<meta name="apple-mobile-web-app-status-bar-style" content="default">` if it isn't already — it is (`black-translucent`), so leave it. Ensure `apple-mobile-web-app-capable` is `yes` (already set).

## Android / desktop

No file changes. Verify current `manifest.webmanifest` already has:
- `background_color: "#0d5c5c"` — used as splash background
- `theme_color: "#0d5c5c"` — used as system UI color
- 512×512 icon with `purpose: "any maskable"` — used for the centered launch mark

All three are present, so Android's splash will render branded automatically.

## Generation approach

Programmatically in one shell step: PIL script reads `public/apple-touch-icon.png` (the existing 180×180 mark), draws each canvas with the teal radial gradient, pastes the icon centered at ~28% of the shorter side, adds the wordmark, and writes all ~22 PNGs to `public/splash/`.

## Files touched
- `public/splash/apple-splash-*.png` (new, ~22 files)
- `src/routes/__root.tsx` (add the `apple-touch-startup-image` link entries)

## Out of scope
- Web-share long screenshots / OG image regeneration
- Native Capacitor splash configuration (would require the mobile shell path, not asked)
- Dark-mode splash variants (iOS 17+ supports `(prefers-color-scheme: dark)` media queries but the brand color already reads well in both — can add later if requested)
