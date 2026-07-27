// Editorial Experience Revamp, Phase 1: one-time baseline capture so later phases can compare
// the reader experience objectively (before/after screenshots + a lightweight in-page a11y
// audit). Extends the same zero-dependency, local-headless-Chrome-over-CDP pattern already used
// by scripts/validate-diagram-layout.mjs -- no Playwright/Puppeteer dependency added.
//
// Usage: start the app first (`npm run dev` or `npm run preview`), then:
//   node scripts/capture-editorial-baseline.mjs [--base-url http://localhost:3000]
//
// This is an artifact-producing script run once per baseline, not wired into CI.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const baseUrlArgIndex = process.argv.indexOf("--base-url");
const baseUrl =
  (baseUrlArgIndex >= 0 && process.argv[baseUrlArgIndex + 1]) ||
  process.env.BASELINE_BASE_URL ||
  "http://localhost:3000";

// One representative route per content kind, plus a list page. Adjust slugs here if the sample
// content used for Phase 1 changes.
const ROUTES = [
  { label: "article", path: "/blogs/article/direct-lake" },
  { label: "design", path: "/blogs/design/lakehouse-direct-lake-bi" },
  { label: "lesson", path: "/blogs/lesson/delta-tables-beginner" },
  { label: "list", path: "/blogs" },
];
const WIDTHS = [390, 768, 1280];
const THEMES = ["light", "dark"];

const outDir = join(root, "baseline");
mkdirSync(outDir, { recursive: true });

const browser = [
  process.env.DIAGRAM_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
]
  .filter(Boolean)
  .find(existsSync);
if (!browser)
  throw new Error("Editorial baseline capture needs Edge/Chrome or DIAGRAM_BROWSER.");

const temp = mkdtempSync(join(tmpdir(), "fabric-atlas-editorial-baseline-"));
const port = 9500 + Math.floor(Math.random() * 300);
const child = spawn(
  browser,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(temp, "profile")}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function pageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === "page");
      if (target) return target;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out connecting to the headless browser.");
}

function send(socket, id, method, params) {
  return new Promise((resolveResult, rejectResult) => {
    const handler = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", handler);
      if (message.error) rejectResult(new Error(message.error.message));
      else resolveResult(message.result);
    };
    socket.addEventListener("message", handler);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

// Same technique validate-diagram-layout.mjs uses for its own custom audit: a small in-page
// evaluation, no external a11y library.
const auditExpression = `(()=>{
const issues=[];
const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>Number(h.tagName[1]));
let previous=0;
for(const level of headings){if(previous&&level>previous+1)issues.push('heading level skips from h'+previous+' to h'+level);previous=level}
const h1Count=document.querySelectorAll('h1').length;
if(h1Count!==1)issues.push('page has '+h1Count+' <h1> elements (expected exactly 1)');
const imgsMissingAlt=[...document.querySelectorAll('img')].filter(img=>!img.alt||!img.alt.trim());
if(imgsMissingAlt.length)issues.push(imgsMissingAlt.length+' <img> element(s) missing alt text');
return issues;
})()`;

let idCounter = 1;
async function capture(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen);
    socket.addEventListener("error", () => rejectOpen(new Error("Browser connection failed.")));
  });
  await send(socket, idCounter++, "Page.enable", {});
  await send(socket, idCounter++, "Runtime.enable", {});

  const summary = [];
  for (const route of ROUTES) {
    await send(socket, idCounter++, "Page.navigate", { url: `${baseUrl}${route.path}` });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));

    for (const theme of THEMES) {
      await send(socket, idCounter++, "Runtime.evaluate", {
        expression: `document.documentElement.classList.toggle('dark', ${theme === "dark"});document.documentElement.dataset.theme='${theme}';`,
        returnByValue: true,
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));

      for (const width of WIDTHS) {
        await send(socket, idCounter++, "Emulation.setDeviceMetricsOverride", {
          width,
          height: 1400,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
        const shot = await send(socket, idCounter++, "Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: 1400, scale: 1 },
        });
        const fileName = `${route.label}-${theme}-${width}.png`;
        writeFileSync(join(outDir, fileName), Buffer.from(shot.data, "base64"));

        const auditResult = await send(socket, idCounter++, "Runtime.evaluate", {
          expression: auditExpression,
          returnByValue: true,
        });
        summary.push({
          route: route.path,
          theme,
          width,
          file: fileName,
          issues: auditResult.result?.value ?? [],
        });
      }
    }

    // One print-media capture per content kind (skip the list page — print isn't a meaningful
    // state there).
    if (route.label !== "list") {
      await send(socket, idCounter++, "Emulation.setEmulatedMedia", { media: "print" });
      await send(socket, idCounter++, "Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1600,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
      const shot = await send(socket, idCounter++, "Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1280, height: 1600, scale: 1 },
      });
      const fileName = `${route.label}-print.png`;
      writeFileSync(join(outDir, fileName), Buffer.from(shot.data, "base64"));
      summary.push({ route: route.path, theme: "print", width: 1280, file: fileName, issues: [] });
      await send(socket, idCounter++, "Emulation.setEmulatedMedia", { media: "screen" });
    }
  }

  socket.close();
  return summary;
}

try {
  const target = await pageTarget();
  const summary = await capture(target);
  const totalIssues = summary.reduce((sum, entry) => sum + entry.issues.length, 0);
  writeFileSync(
    join(root, "baseline/summary.json"),
    JSON.stringify({ capturedAt: baseUrl, routes: ROUTES, widths: WIDTHS, themes: THEMES, results: summary }, null, 2),
  );
  console.log(
    `Editorial baseline captured: ${summary.length} shots across ${ROUTES.length} routes, ${totalIssues} audit issue(s) flagged. See baseline/summary.json.`,
  );
  if (totalIssues) {
    console.log("Issues found (informational for Phase 1 baseline, not a failure):");
    for (const entry of summary) if (entry.issues.length) console.log(`- ${entry.route} (${entry.theme}, ${entry.width}px): ${entry.issues.join("; ")}`);
  }
} finally {
  child.kill();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  try {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }
}
