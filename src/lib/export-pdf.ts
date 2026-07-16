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
const FOOTER_RESERVE = 8; // mm reserved at bottom for footer
const USABLE_H = CONTENT_H - FOOTER_RESERVE;
const CLONE_WIDTH_PX = 820;

/** Block selectors we treat as atomic paginated units. */
const BLOCK_SELECTOR =
  "h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,table,figure,hr,section,aside,div.callout,div.diagram-embed,[data-diagram-slug]";

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => undefined);
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
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
    "color:#111827",
    "font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
    "font-size:15px",
    "line-height:1.65",
    "color-scheme:light",
    "z-index:-1",
  ].join(";");
  wrapper.className = "pdf-export-root";
  // Force light tokens inside the clone regardless of app theme.
  wrapper.style.setProperty("--background", "#ffffff");
  wrapper.style.setProperty("--foreground", "#111827");
  wrapper.style.setProperty("--card", "#ffffff");
  wrapper.style.setProperty("--card-foreground", "#111827");
  wrapper.style.setProperty("--muted", "#f3f4f6");
  wrapper.style.setProperty("--muted-foreground", "#4b5563");
  wrapper.style.setProperty("--border", "#e5e7eb");

  const clone = sourceEl.cloneNode(true) as HTMLElement;

  // Strip interactive/print-hostile affordances.
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

  // Ensure SVG diagrams fill available width and preserve aspect.
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

async function renderBlock(
  el: HTMLElement,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; widthMm: number; heightMm: number }> {
  const canvas = await html2canvas(el, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
  const pxPerMm = canvas.width / CONTENT_W;
  return {
    canvas,
    widthMm: CONTENT_W,
    heightMm: canvas.height / pxPerMm,
  };
}

function sliceCanvasVertically(
  source: HTMLCanvasElement,
  offsetPx: number,
  heightPx: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = heightPx;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, -offsetPx);
  return out;
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

/** Collect the atomic blocks in document order from the cloned article. */
function collectBlocks(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  // Walk direct descendants first; if a container has no matching direct
  // block children, recurse into it so nested article wrappers still yield
  // paginated blocks.
  const visit = (node: HTMLElement) => {
    const kids = Array.from(node.children) as HTMLElement[];
    for (const kid of kids) {
      if (kid.matches(BLOCK_SELECTOR)) {
        out.push(kid);
      } else if (kid.children.length > 0) {
        visit(kid);
      }
    }
  };
  visit(root);
  return out;
}

function isHeading(el: HTMLElement): boolean {
  return /^H[1-6]$/.test(el.tagName);
}

function containsSvg(el: HTMLElement): boolean {
  return !!el.querySelector("svg");
}

export async function exportArticlePdf(articleEl: HTMLElement, meta: PdfMeta) {
  const printable = buildPrintable(articleEl);
  try {
    await waitForImages(printable);
    // Give web fonts a tick to settle for accurate metrics.
    await new Promise((r) => setTimeout(r, 50));

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    drawTitlePage(pdf, meta);

    // Start body on a fresh page.
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
      const scale = containsSvg(block) ? 3 : 2;
      const rendered = await renderBlock(block, scale);
      const { canvas, heightMm } = rendered;
      const pxPerMm = canvas.width / CONTENT_W;

      // Orphan-heading avoidance: if this is a heading and the next block
      // wouldn't fit alongside it on the current page, start a new page now.
      if (
        isHeading(block) &&
        i + 1 < blocks.length &&
        cursorY + heightMm + 20 > MARGIN + USABLE_H &&
        cursorY > MARGIN
      ) {
        newPage();
      }

      const remaining = MARGIN + USABLE_H - cursorY;

      if (heightMm <= remaining) {
        placeImage(canvas, heightMm);
        continue;
      }

      // Doesn't fit in remaining space.
      if (heightMm <= USABLE_H) {
        // Fits on a fresh page whole — start a new page and place it.
        newPage();
        placeImage(canvas, heightMm);
        continue;
      }

      // Larger than a full page.
      if (containsSvg(block) || block.tagName === "FIGURE" || block.tagName === "TABLE") {
        // Scale down proportionally to fit one page, keep intact.
        newPage();
        const scaleDown = USABLE_H / heightMm;
        const w = CONTENT_W * scaleDown;
        const h = USABLE_H;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(dataUrl, "JPEG", MARGIN + (CONTENT_W - w) / 2, cursorY, w, h);
        cursorY += h;
        continue;
      }

      // Prose / code / lists: slice at page boundaries.
      let offsetPx = 0;
      const totalPx = canvas.height;
      // First slice into remaining space if there's room for at least ~20mm.
      if (remaining > 20) {
        const sliceHeightPx = Math.min(remaining * pxPerMm, totalPx);
        const slice = sliceCanvasVertically(canvas, offsetPx, sliceHeightPx);
        placeImage(slice, sliceHeightPx / pxPerMm);
        offsetPx += sliceHeightPx;
      }
      while (offsetPx < totalPx) {
        newPage();
        const sliceHeightPx = Math.min(USABLE_H * pxPerMm, totalPx - offsetPx);
        const slice = sliceCanvasVertically(canvas, offsetPx, sliceHeightPx);
        placeImage(slice, sliceHeightPx / pxPerMm);
        offsetPx += sliceHeightPx;
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
