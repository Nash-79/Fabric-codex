import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export type PdfMeta = {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  updatedAt?: string | null;
  citations?: Array<{
    source?: { title?: string | null; url?: string | null; tier?: number | null } | null;
  }>;
};

const A4_W = 210; // mm
const A4_H = 297;
const MARGIN = 14;
const CONTENT_W = A4_W - MARGIN * 2;
const CONTENT_H = A4_H - MARGIN * 2;
const FOOTER_RESERVE = 8;
const USABLE_H = CONTENT_H - FOOTER_RESERVE;
const CLONE_WIDTH_PX = 820;

// Rendered at scale 2 with body font-size 15px * line-height 1.65 → ~49.5px/line.
const APPROX_LINE_PX = 50;

const BLOCK_SELECTOR =
  "h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,table,figure,hr,section,aside,div.callout,div.diagram-embed,[data-diagram-slug]";

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => undefined);
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }),
  );
}

/**
 * Diagrams lazy-mount via IntersectionObserver — if we clone the article while
 * they're still placeholders we capture empty boxes. Scroll the live document
 * end-to-end first so every observer fires, then restore scroll position.
 */
async function primeLazyContent(articleEl: HTMLElement) {
  const originalScroll = window.scrollY;
  const doc = document.documentElement;
  const maxY = Math.max(doc.scrollHeight, articleEl.scrollHeight);
  const step = Math.max(400, window.innerHeight * 0.8);
  for (let y = 0; y <= maxY; y += step) {
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo({ top: maxY, behavior: "instant" as ScrollBehavior });
  await new Promise((r) => setTimeout(r, 250));
  await waitForImages(articleEl);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  window.scrollTo({ top: originalScroll, behavior: "instant" as ScrollBehavior });
}

function buildPrintable(sourceEl: HTMLElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${CLONE_WIDTH_PX}px`,
    "padding:0",
    "margin:0",
    "background:#ffffff",
    "color:#0f172a",
    "font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
    "font-size:15px",
    "line-height:1.65",
    "color-scheme:light",
    "z-index:-1",
  ].join(";");
  wrapper.className = "pdf-export-root light";
  // Override every semantic token the app defines. Without this, if the live
  // <html> is in dark mode when export is triggered, html2canvas captures the
  // dark palette from descendants' computed styles even though the wrapper
  // itself is white.
  const lightTokens: Record<string, string> = {
    "--background": "#ffffff",
    "--foreground": "#0f172a",
    "--card": "#ffffff",
    "--card-foreground": "#0f172a",
    "--popover": "#ffffff",
    "--popover-foreground": "#0f172a",
    "--primary": "#0f172a",
    "--primary-foreground": "#ffffff",
    "--secondary": "#f1f5f9",
    "--secondary-foreground": "#0f172a",
    "--muted": "#f3f4f6",
    "--muted-foreground": "#4b5563",
    "--accent": "#f1f5f9",
    "--accent-foreground": "#0f172a",
    "--destructive": "#dc2626",
    "--destructive-foreground": "#ffffff",
    "--border": "#e5e7eb",
    "--input": "#e5e7eb",
    "--ring": "#94a3b8",
    "--sidebar-background": "#ffffff",
    "--sidebar-foreground": "#0f172a",
    "--sidebar-border": "#e5e7eb",
  };
  for (const [k, v] of Object.entries(lightTokens)) wrapper.style.setProperty(k, v);

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .pdf-export-root, .pdf-export-root * {
      color-scheme: light !important;
      box-shadow: none !important;
      text-shadow: none !important;
      filter: none !important;
      backdrop-filter: none !important;
    }
    .pdf-export-root, .pdf-export-root *:not(pre):not(code):not(kbd):not(mark):not(th):not([data-keep-bg]) {
      background-color: transparent !important;
      background-image: none !important;
    }
    .pdf-export-root { background: #ffffff !important; color: #0f172a !important; }
    .pdf-export-root h1, .pdf-export-root h2, .pdf-export-root h3,
    .pdf-export-root h4, .pdf-export-root h5, .pdf-export-root h6 { color: #0f172a !important; }
    .pdf-export-root p, .pdf-export-root li, .pdf-export-root td,
    .pdf-export-root th, .pdf-export-root span, .pdf-export-root div,
    .pdf-export-root blockquote { color: #1f2937 !important; }
    .pdf-export-root a { color: #1d4ed8 !important; text-decoration: underline; }
    .pdf-export-root code, .pdf-export-root kbd {
      background-color: #f1f5f9 !important; color: #0f172a !important;
      border: 1px solid #e2e8f0 !important; border-radius: 4px; padding: 0 4px;
    }
    .pdf-export-root pre {
      background-color: #f8fafc !important; color: #0f172a !important;
      border: 1px solid #e2e8f0 !important; border-radius: 6px; padding: 12px;
    }
    .pdf-export-root pre code { background: transparent !important; border: 0 !important; padding: 0 !important; }
    .pdf-export-root table { border-collapse: collapse !important; width: 100%; }
    .pdf-export-root th, .pdf-export-root td {
      border: 1px solid #e5e7eb !important; padding: 6px 8px !important;
    }
    .pdf-export-root th { background-color: #f8fafc !important; }
    .pdf-export-root hr { border-color: #e5e7eb !important; }
    .pdf-export-root [class*="border"] { border-color: #e5e7eb !important; }
  `;
  wrapper.appendChild(styleEl);

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  // Strip dark-mode markers so Tailwind's dark: variants stop applying inside the clone.
  clone.classList.remove("dark");
  clone.querySelectorAll<HTMLElement>(".dark").forEach((el) => el.classList.remove("dark"));

  clone
    .querySelectorAll(
      ".no-print, button, [data-no-print], [role='tooltip'], .diagram-tooltip, .diagram-overlay",
    )
    .forEach((el) => el.remove());

  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.style.outline = "none";
    el.style.boxShadow = "none";
  });

  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("crossorigin", "anonymous");
    (img as HTMLImageElement).style.maxWidth = "100%";
    (img as HTMLImageElement).style.height = "auto";
  });

  clone.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
  });

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return wrapper;
}

async function renderBlock(el: HTMLElement, scale: number) {
  const canvas = await html2canvas(el, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
  const pxPerMm = canvas.width / CONTENT_W;
  return {
    canvas,
    pxPerMm,
    heightMm: canvas.height / pxPerMm,
  };
}

function sliceCanvas(source: HTMLCanvasElement, offsetPx: number, heightPx: number) {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = Math.max(1, Math.round(heightPx));
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, -offsetPx);
  return out;
}

/** Snap a candidate slice height down to the nearest line boundary. */
function snapSliceHeight(desiredPx: number, pxPerMm: number) {
  const linesPerBlock = Math.floor(desiredPx / (APPROX_LINE_PX * (pxPerMm / 2)));
  if (linesPerBlock <= 0) return desiredPx;
  const snapped = linesPerBlock * APPROX_LINE_PX * (pxPerMm / 2);
  // Leave a small safety gutter so descenders don't get clipped.
  return Math.max(APPROX_LINE_PX, snapped - 4);
}

function addFooter(pdf: jsPDF, page: number, total: number, title: string) {
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.setFont("helvetica", "normal");
  const short = title.length > 80 ? `${title.slice(0, 77)}…` : title;
  pdf.text(`Fabric Atlas · ${short}`, MARGIN, A4_H - 6);
  pdf.text(`Page ${page} / ${total}`, A4_W - MARGIN, A4_H - 6, { align: "right" });
}

function drawTitlePage(pdf: jsPDF, meta: PdfMeta) {
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, A4_W, 64, "F");
  pdf.setTextColor(255);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("FABRIC ATLAS", MARGIN, 22);
  pdf.setFontSize(22);
  const titleLines = pdf.splitTextToSize(meta.title, A4_W - MARGIN * 2);
  pdf.text(titleLines, MARGIN, 42);

  pdf.setTextColor(30);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  let y = 82;
  if (meta.summary) {
    const s = pdf.splitTextToSize(meta.summary, A4_W - MARGIN * 2);
    pdf.text(s, MARGIN, y);
    y += s.length * 6 + 4;
  }
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  const bits: string[] = [];
  if (meta.updatedAt) {
    bits.push(
      `Updated ${new Date(meta.updatedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
    );
  }
  if (meta.citations?.length) bits.push(`${meta.citations.length} cited sources`);
  if (bits.length) {
    pdf.text(bits.join("  ·  "), MARGIN, y);
    y += 6;
  }
  if (meta.tags?.length) {
    pdf.text(meta.tags.map((t) => `#${t}`).join("  "), MARGIN, y);
  }
}

function drawSourcesAppendix(pdf: jsPDF, meta: PdfMeta) {
  if (!meta.citations?.length) return;
  pdf.addPage();
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("Sources", MARGIN, MARGIN + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  let sy = MARGIN + 16;
  meta.citations.forEach((c, i) => {
    const src = c.source ?? {};
    const line = `[S${i + 1}] ${src.title ?? src.url ?? "Untitled"}${
      src.tier != null ? `  (T${src.tier})` : ""
    }`;
    const wrapped = pdf.splitTextToSize(line, A4_W - MARGIN * 2);
    if (sy + wrapped.length * 5 > A4_H - MARGIN - FOOTER_RESERVE) {
      pdf.addPage();
      sy = MARGIN + 6;
    }
    pdf.setTextColor(20);
    pdf.text(wrapped, MARGIN, sy);
    sy += wrapped.length * 5;
    if (src.url) {
      pdf.setTextColor(90, 130, 200);
      const urlLines = pdf.splitTextToSize(src.url, A4_W - MARGIN * 2);
      if (sy + urlLines.length * 5 > A4_H - MARGIN - FOOTER_RESERVE) {
        pdf.addPage();
        sy = MARGIN + 6;
      }
      pdf.text(urlLines, MARGIN, sy);
      sy += urlLines.length * 5 + 3;
    } else {
      sy += 3;
    }
  });
}

function collectBlocks(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const visit = (node: HTMLElement) => {
    const kids = Array.from(node.children) as HTMLElement[];
    for (const kid of kids) {
      if (kid.matches(BLOCK_SELECTOR)) out.push(kid);
      else if (kid.children.length > 0) visit(kid);
    }
  };
  visit(root);
  return out;
}

const isHeading = (el: HTMLElement) => /^H[1-6]$/.test(el.tagName);
const isAtomic = (el: HTMLElement) =>
  el.tagName === "FIGURE" ||
  el.tagName === "TABLE" ||
  !!el.querySelector("svg") ||
  !!el.querySelector("img") ||
  !!el.closest?.("[data-diagram-slug]");

export async function exportArticlePdf(articleEl: HTMLElement, meta: PdfMeta) {
  await primeLazyContent(articleEl);
  const printable = buildPrintable(articleEl);
  try {
    await waitForImages(printable);
    await new Promise((r) => setTimeout(r, 80));

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    drawTitlePage(pdf, meta);

    pdf.addPage();
    let cursorY = MARGIN;

    const blocks = collectBlocks(printable.firstElementChild as HTMLElement);

    const placeImage = (canvas: HTMLCanvasElement, heightMm: number) => {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(dataUrl, "JPEG", MARGIN, cursorY, CONTENT_W, heightMm);
      cursorY += heightMm;
    };

    const newPage = () => {
      pdf.addPage();
      cursorY = MARGIN;
    };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const scale = block.querySelector("svg") ? 3 : 2;
      const { canvas, pxPerMm, heightMm } = await renderBlock(block, scale);

      // Orphan heading: never leave a heading alone at page bottom.
      if (
        isHeading(block) &&
        i + 1 < blocks.length &&
        cursorY + heightMm + 24 > MARGIN + USABLE_H &&
        cursorY > MARGIN
      ) {
        newPage();
      }

      const remaining = MARGIN + USABLE_H - cursorY;

      if (heightMm <= remaining) {
        placeImage(canvas, heightMm);
        continue;
      }

      if (heightMm <= USABLE_H) {
        newPage();
        placeImage(canvas, heightMm);
        continue;
      }

      if (isAtomic(block)) {
        // Scale a huge diagram/figure/table to one page rather than splitting.
        newPage();
        const scaleDown = USABLE_H / heightMm;
        const w = CONTENT_W * scaleDown;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(dataUrl, "JPEG", MARGIN + (CONTENT_W - w) / 2, cursorY, w, USABLE_H);
        cursorY += USABLE_H;
        continue;
      }

      // Prose / list / code: slice on line boundaries.
      let offsetPx = 0;
      const totalPx = canvas.height;
      if (remaining > 30) {
        const desired = Math.min(remaining * pxPerMm, totalPx);
        const sliceH = snapSliceHeight(desired, pxPerMm);
        const slice = sliceCanvas(canvas, offsetPx, sliceH);
        placeImage(slice, sliceH / pxPerMm);
        offsetPx += sliceH;
      }
      while (offsetPx < totalPx) {
        newPage();
        const desired = Math.min(USABLE_H * pxPerMm, totalPx - offsetPx);
        const sliceH =
          totalPx - offsetPx <= USABLE_H * pxPerMm ? desired : snapSliceHeight(desired, pxPerMm);
        const slice = sliceCanvas(canvas, offsetPx, sliceH);
        placeImage(slice, sliceH / pxPerMm);
        offsetPx += sliceH;
      }
    }

    drawSourcesAppendix(pdf, meta);

    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      addFooter(pdf, p, total, meta.title);
    }

    const slug = meta.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
    pdf.save(`${slug || "article"}.pdf`);
  } finally {
    printable.remove();
  }
}
