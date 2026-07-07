import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export type PdfMeta = {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  updatedAt?: string | null;
  citations?: Array<{ source?: { title?: string | null; url?: string | null; tier?: number | null } | null }>;
};

const A4_W = 210; // mm
const A4_H = 297;
const MARGIN = 12;

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
    "width:800px",
    "padding:32px",
    "background:#ffffff",
    "color:#111827",
    "font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
    "font-size:15px",
    "line-height:1.65",
    "z-index:-1",
  ].join(";");
  wrapper.className = "pdf-export-root";
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  // Strip interactive-only affordances
  clone.querySelectorAll(".no-print, button, [data-no-print]").forEach((el) => el.remove());
  // Force all images to inline sizing
  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("crossorigin", "anonymous");
    (img as HTMLImageElement).style.maxWidth = "100%";
    (img as HTMLImageElement).style.height = "auto";
  });
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return wrapper;
}

function addFooter(pdf: jsPDF, page: number, total: number, title: string) {
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`Fabric Atlas · ${title}`, MARGIN, A4_H - 6);
  pdf.text(`Page ${page} / ${total}`, A4_W - MARGIN, A4_H - 6, { align: "right" });
}

export async function exportArticlePdf(articleEl: HTMLElement, meta: PdfMeta) {
  const printable = buildPrintable(articleEl);
  try {
    await waitForImages(printable);

    const canvas = await html2canvas(printable, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    // ---- Title page ----
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, A4_W, 60, "F");
    pdf.setTextColor(255);
    pdf.setFontSize(10);
    pdf.text("FABRIC ATLAS", MARGIN, 20);
    pdf.setFontSize(22);
    pdf.setFont("helvetica", "bold");
    const titleLines = pdf.splitTextToSize(meta.title, A4_W - MARGIN * 2);
    pdf.text(titleLines, MARGIN, 38);

    pdf.setTextColor(30);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    let y = 78;
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
    if (bits.length) pdf.text(bits.join("  ·  "), MARGIN, y);
    if (meta.tags?.length) {
      pdf.text(meta.tags.map((t) => `#${t}`).join("  "), MARGIN, y + 6);
    }

    // ---- Body: slice canvas into pages ----
    const pxPerMm = canvas.width / (A4_W - MARGIN * 2);
    const pageContentHeightPx = (A4_H - MARGIN * 2) * pxPerMm;
    let renderedPx = 0;

    while (renderedPx < canvas.height) {
      pdf.addPage();
      const sliceHeight = Math.min(pageContentHeightPx, canvas.height - renderedPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, -renderedPx);
      const dataUrl = pageCanvas.toDataURL("image/jpeg", 0.92);
      const heightMm = sliceHeight / pxPerMm;
      pdf.addImage(dataUrl, "JPEG", MARGIN, MARGIN, A4_W - MARGIN * 2, heightMm);
      renderedPx += sliceHeight;
    }

    // ---- Sources appendix ----
    if (meta.citations?.length) {
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
        if (sy + wrapped.length * 5 > A4_H - MARGIN - 10) {
          pdf.addPage();
          sy = MARGIN + 6;
        }
        pdf.setTextColor(20);
        pdf.text(wrapped, MARGIN, sy);
        sy += wrapped.length * 5;
        if (src.url) {
          pdf.setTextColor(90, 130, 200);
          const urlLines = pdf.splitTextToSize(src.url, A4_W - MARGIN * 2);
          pdf.text(urlLines, MARGIN, sy);
          sy += urlLines.length * 5 + 3;
        } else {
          sy += 3;
        }
      });
    }

    // Footers on every page
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
