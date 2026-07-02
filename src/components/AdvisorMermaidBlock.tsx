import { useEffect, useRef, useState } from "react";
import { Check, Copy, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// Helper to load mermaid from window or dynamic import
let mermaidPromise: Promise<any> | null = null;
function getMermaid() {
  if (typeof window === "undefined") return null;
  if ((window as any).mermaid) return Promise.resolve((window as any).mermaid);
  if (mermaidPromise) return mermaidPromise;

  mermaidPromise = import("mermaid").then((m) => {
    const mermaidInstance = m.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
      securityLevel: "loose",
      themeVariables: {
        background: "transparent",
      },
    });
    return mermaidInstance;
  });
  return mermaidPromise;
}

export function AdvisorMermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const elementId = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    let active = true;
    const mermaidLoader = getMermaid();
    if (!mermaidLoader) return;

    mermaidLoader.then((mermaid) => {
      if (!active) return;
      try {
        setError(null);
        // Clean up code: remove any leading/trailing space or markdown tags
        const cleanedCode = code.trim();
        mermaid
          .render(elementId.current, cleanedCode)
          .then(({ svg: renderedSvg }: any) => {
            if (active) setSvg(renderedSvg);
          })
          .catch((err: any) => {
            console.error("Mermaid render error:", err);
            // Delete temporary element created by mermaid if it exists in DOM
            const badEl = document.getElementById(elementId.current);
            if (badEl) badEl.remove();
            const bindEl = document.getElementById(`d${elementId.current}`);
            if (bindEl) bindEl.remove();

            if (active) {
              setError("Could not render diagram. Click 'Copy Code' to view raw Mermaid text.");
            }
          });
      } catch (err: any) {
        console.error("Mermaid error:", err);
        if (active) setError(String(err));
      }
    });

    return () => {
      active = false;
    };
  }, [code]);

  async function copyCode() {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (error) {
    return (
      <div className="not-prose my-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-destructive">Mermaid Diagram Error</span>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy Code"}
          </button>
        </div>
        <pre className="text-xs font-mono text-destructive dark:text-destructive-foreground/80 whitespace-pre-wrap">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="not-prose my-4 rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Diagram
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="p-4 flex flex-col items-center justify-center bg-white/5 dark:bg-black/5 relative group">
        {svg ? (
          <>
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="w-full cursor-zoom-in flex justify-center py-2 [&_svg]:max-w-full [&_svg]:h-auto text-foreground"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
              <ZoomIn className="h-3.5 w-3.5" /> Click to zoom
            </span>
          </>
        ) : (
          <div className="py-8 text-xs text-muted-foreground animate-pulse">
            Rendering diagram...
          </div>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] gap-0 overflow-hidden bg-background p-0 sm:rounded-xl">
          <DialogTitle className="sr-only">Zoomed Solution Architecture Diagram</DialogTitle>
          <TransformWrapper
            minScale={0.5}
            maxScale={6}
            initialScale={1}
            centerOnInit
            doubleClick={{ mode: "toggle" }}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {svg && (
                <div
                  className="max-h-[85vh] w-auto [&_svg]:max-h-[85vh] [&_svg]:w-auto text-foreground"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              )}
            </TransformComponent>
          </TransformWrapper>
        </DialogContent>
      </Dialog>
    </div>
  );
}
