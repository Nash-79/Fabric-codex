import type { PdfMeta } from "./export-pdf";

async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function inlineImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      const abs = new URL(src, window.location.href).toString();
      const data = await urlToDataUri(abs);
      if (data) img.setAttribute("src", data);
      img.removeAttribute("crossorigin");
      img.removeAttribute("loading");
    }),
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_STYLES = `
  :root {
    color-scheme: light;
    --fg: #111827;
    --muted: #4b5563;
    --border: #e5e7eb;
    --card: #ffffff;
    --bg: #ffffff;
    --code-bg: #f3f4f6;
    --accent: #0f172a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 16px; line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }
  header.cover {
    background: var(--accent); color: #fff;
    padding: 32px 20px; margin-bottom: 32px; border-radius: 12px;
  }
  header.cover .kicker { font-size: 12px; letter-spacing: .12em; opacity: .8; }
  header.cover h1 { font-size: 30px; margin: 8px 0 12px; line-height: 1.2; }
  header.cover .summary { font-size: 15px; opacity: .92; margin: 0 0 12px; }
  header.cover .meta { font-size: 12px; opacity: .8; }
  header.cover .tags { margin-top: 8px; font-size: 12px; opacity: .85; }
  article h1, article h2, article h3, article h4 { color: var(--fg); line-height: 1.25; margin-top: 1.6em; }
  article h1 { font-size: 28px; }
  article h2 { font-size: 22px; border-bottom: 1px solid var(--border); padding-bottom: .3em; }
  article h3 { font-size: 18px; }
  article p, article li { color: var(--fg); }
  article a { color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px; }
  article ul, article ol { padding-left: 1.4em; }
  article code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-size: .92em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  article pre { background: var(--code-bg); color: #111; padding: 16px; border-radius: 8px; overflow: auto; }
  article pre code { background: transparent; padding: 0; }
  article blockquote { border-left: 3px solid var(--border); margin: 1em 0; padding: .2em 1em; color: var(--muted); }
  article table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 14px; }
  article th, article td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: top; }
  article th { background: #f9fafb; }
  article figure { margin: 1.4em 0; }
  article figcaption { font-size: 13px; color: var(--muted); margin-top: 6px; text-align: center; }
  article img, article svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  .callout { border: 1px solid var(--border); background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin: 1em 0; }
  section.sources { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  section.sources h2 { font-size: 20px; margin: 0 0 12px; }
  section.sources ol { padding-left: 1.4em; }
  section.sources li { margin-bottom: 8px; font-size: 14px; }
  section.sources a { color: #1d4ed8; word-break: break-all; }
  footer.doc { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; text-align: center; }
  @media print {
    main { max-width: none; }
    header.cover { break-after: page; }
    article h2, article h3 { break-after: avoid; }
    article figure, article table, article pre { break-inside: avoid; }
  }
`;

function buildHeaderHtml(meta: PdfMeta): string {
  const summary = meta.summary ? `<p class="summary">${escapeHtml(meta.summary)}</p>` : "";
  const bits: string[] = [];
  if (meta.updatedAt) {
    const d = new Date(meta.updatedAt);
    bits.push(
      `Updated ${d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
    );
  }
  if (meta.citations?.length) bits.push(`${meta.citations.length} cited sources`);
  const meta1 = bits.length ? `<div class="meta">${escapeHtml(bits.join("  ·  "))}</div>` : "";
  const tags = meta.tags?.length
    ? `<div class="tags">${meta.tags.map((t) => `#${escapeHtml(t)}`).join("&nbsp;&nbsp;")}</div>`
    : "";
  return `<header class="cover">
    <div class="kicker">FABRIC ATLAS</div>
    <h1>${escapeHtml(meta.title)}</h1>
    ${summary}${meta1}${tags}
  </header>`;
}

function buildSourcesHtml(meta: PdfMeta): string {
  if (!meta.citations?.length) return "";
  const items = meta.citations
    .map((c, i) => {
      const src = c.source ?? {};
      const title = escapeHtml(src.title ?? src.url ?? "Untitled");
      const tier = src.tier != null ? ` <span style="color:#6b7280">(T${src.tier})</span>` : "";
      const url = src.url
        ? `<br><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.url)}</a>`
        : "";
      return `<li id="s${i + 1}"><strong>[S${i + 1}]</strong> ${title}${tier}${url}</li>`;
    })
    .join("");
  return `<section class="sources"><h2>Sources</h2><ol>${items}</ol></section>`;
}

export async function exportArticleHtml(articleEl: HTMLElement, meta: PdfMeta) {
  const clone = articleEl.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      ".no-print, button, [data-no-print], [role='tooltip'], .diagram-tooltip, .diagram-overlay",
    )
    .forEach((el) => el.remove());
  // Neutralise inline theme-driven classes/styles that break outside the app.
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.removeAttribute("data-state");
    el.style.removeProperty("outline");
    el.style.removeProperty("box-shadow");
  });

  await inlineImages(clone);

  const bodyHtml = `<main>
    ${buildHeaderHtml(meta)}
    <article>${clone.innerHTML}</article>
    ${buildSourcesHtml(meta)}
    <footer class="doc">Fabric Atlas · ${escapeHtml(meta.title)}</footer>
  </main>`;

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} · Fabric Atlas</title>
${meta.summary ? `<meta name="description" content="${escapeHtml(meta.summary)}">` : ""}
<style>${BASE_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(meta.title) || "article"}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
