import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";
import {
  Maximize2,
  Minimize2,
  Move,
  Plus,
  Minus,
  RotateCcw,
  Scan,
  Sparkles,
  X,
  ZoomIn,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InteractiveDiagram } from "@/components/InteractiveDiagram";
import { DiagramWalkthroughBar } from "@/components/DiagramWalkthroughBar";
import type { Citation } from "@/components/CitationSidebar";
import type { AuthoredDiagram } from "@/diagrams/types";

// Module-level cache of natural aspect ratios so revisiting an image doesn't
// re-run the reflow after decode.
const ratioCache = new Map<string, number>();

function ratioFromSvg(markup?: string) {
  if (!markup) return null;
  const match = /<svg\b[^>]*\bviewBox=["']\s*[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)\s*["']/i.exec(
    markup,
  );
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  return width > 0 && height > 0 ? width / height : null;
}

export function DiagramLightbox({
  src,
  alt,
  caption,
  figureIndex,
  svgMarkup,
  definition,
  citations,
}: {
  src: string;
  alt: string;
  caption?: string;
  figureIndex?: number;
  svgMarkup?: string;
  definition?: AuthoredDiagram;
  citations?: Citation[];
}) {
  const [open, setOpen] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [ratio, setRatio] = useState<number | null>(
    () => ratioCache.get(src) ?? ratioFromSvg(svgMarkup),
  );
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth && !ratio) {
      const r = img.naturalWidth / img.naturalHeight;
      ratioCache.set(src, r);
      setRatio(r);
    }
  }, [src, ratio]);

  // Defer mounting the <img> until the placeholder scrolls near the viewport,
  // or the user opens the lightbox for this figure.
  useEffect(() => {
    if (inView) return;
    const el = triggerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (open) setInView(true);
  }, [open]);

  const aspectRatio = ratio ?? 16 / 9;
  const figId = figureIndex ? `figure-${figureIndex}` : undefined;
  const captionId = figId ? `${figId}-caption` : undefined;
  const describeId = figId ? `${figId}-desc` : undefined;
  const captionText = caption || alt;
  // "standard" (default) keeps today's behavior — inside the reading column. "wide"/"full-bleed"
  // break out via negative-margin tricks; this is new CSS with no existing precedent in this
  // codebase, verify visually before treating full-bleed as production-ready.
  const layoutHint = definition?.layoutHint ?? "standard";
  const layoutClass =
    layoutHint === "full-bleed"
      ? "sm:w-screen sm:max-w-none sm:relative sm:left-1/2 sm:right-1/2 sm:-mx-[50vw]"
      : layoutHint === "wide"
        ? "sm:w-[min(64rem,100%)] sm:max-w-none sm:-mx-[calc((min(64rem,100%)-48rem)/2)]"
        : "";

  return (
    <>
      <figure
        id={figId}
        className={cn("not-prose article-figure group my-10 scroll-mt-24", layoutClass)}
        style={
          { contentVisibility: "auto", containIntrinsicSize: `600px auto` } as React.CSSProperties
        }
        aria-labelledby={captionText && captionId ? captionId : undefined}
        aria-label={!captionText ? alt || "Diagram" : undefined}
      >
        <div
          ref={triggerRef}
          className="relative block w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/20 transition-colors hover:border-teal-500/50"
          style={{ aspectRatio: `${aspectRatio}` }}
        >
          {inView && svgMarkup && definition ? (
            <InteractiveDiagram
              markup={svgMarkup}
              definition={definition}
              citations={citations}
              className="h-full w-full"
            />
          ) : inView ? (
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              // @ts-expect-error non-standard React prop, valid HTML attribute
              fetchpriority="low"
              className="h-full w-full object-contain"
              onLoad={(e) => {
                const t = e.currentTarget;
                if (t.naturalWidth && t.naturalHeight) {
                  const r = t.naturalWidth / t.naturalHeight;
                  ratioCache.set(src, r);
                  if (Math.abs(r - aspectRatio) > 0.01) setRatio(r);
                }
              }}
            />
          ) : (
            <div aria-hidden className="h-full w-full animate-pulse bg-muted/50" />
          )}
          <noscript>
            <img src={src} alt={alt} className="h-full w-full object-contain" />
          </noscript>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open diagram${figureIndex ? ` ${figureIndex}` : ""}: ${alt || caption || "diagram"} in zoom view`}
            aria-haspopup="dialog"
            className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Click to zoom · pan</span>
            <span className="sm:hidden">Tap to zoom</span>
          </button>
        </div>
        {captionText && (
          <figcaption
            id={captionId}
            className="mx-auto mt-3 max-w-[62ch] text-center text-sm italic leading-relaxed text-muted-foreground"
          >
            {captionText}
          </figcaption>
        )}
      </figure>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 overflow-hidden border-0 bg-background p-0 [&>button]:hidden sm:h-[94dvh] sm:max-h-[94dvh] sm:w-[98vw] sm:max-w-[98vw] sm:rounded-2xl sm:border"
          aria-describedby={describeId}
          onEscapeKeyDown={(e) => {
            // Innermost-mode-first: the first Escape exits walkthrough mode rather than closing
            // the dialog; a second Escape (walkthrough already closed) closes normally.
            if (walkthroughOpen) {
              e.preventDefault();
              setWalkthroughOpen(false);
            }
          }}
        >
          <DialogTitle className="sr-only">
            {figureIndex ? `Figure ${figureIndex}: ` : "Diagram: "}
            {alt || caption || "Diagram"}
          </DialogTitle>
          {describeId && (
            <p id={describeId} className="sr-only">
              {captionText || alt || "Diagram"}. Use plus and minus to zoom, zero to reset, F for
              full-screen, and Escape to close. On touch devices, pinch to zoom and drag to pan.
            </p>
          )}
          <LightboxViewer
            src={src}
            alt={alt}
            caption={caption}
            figureIndex={figureIndex}
            svgMarkup={svgMarkup}
            definition={definition}
            citations={citations}
            onClose={() => setOpen(false)}
            walkthroughOpen={walkthroughOpen}
            onWalkthroughOpenChange={setWalkthroughOpen}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LightboxViewer({
  src,
  alt,
  caption,
  figureIndex,
  svgMarkup,
  definition,
  citations,
  onClose,
  walkthroughOpen,
  onWalkthroughOpenChange,
}: {
  src: string;
  alt: string;
  caption?: string;
  figureIndex?: number;
  svgMarkup?: string;
  definition?: AuthoredDiagram;
  citations?: Citation[];
  onClose: () => void;
  walkthroughOpen: boolean;
  onWalkthroughOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scaleRef = useRef(1);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const hasWalkthrough = Boolean(definition?.walkthrough.length);
  const walkthroughStep = definition?.walkthrough[walkthroughStepIndex];
  const walkthroughTotal = definition?.walkthrough.length ?? 0;

  function exitWalkthrough() {
    onWalkthroughOpenChange(false);
    setWalkthroughStepIndex(0);
  }

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof el.requestFullscreen !== "function") {
      setIsFullscreen((value) => !value);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback: use CSS "cover" via isFullscreen state.
      setIsFullscreen((v) => !v);
    }
  }, []);

  const fsActive =
    isFullscreen || (typeof document !== "undefined" && !!document.fullscreenElement);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex h-full w-full flex-col bg-background",
        "[overscroll-behavior:contain] [touch-action:none]",
        isFullscreen &&
          typeof document !== "undefined" &&
          !document.fullscreenElement &&
          "fixed inset-0 z-[100]",
      )}
    >
      <TransformWrapper
        minScale={0.4}
        maxScale={8}
        initialScale={1}
        centerOnInit
        limitToBounds={false}
        doubleClick={{ mode: "zoomIn", step: 0.7 }}
        wheel={{ step: 0.15 }}
        pinch={{ step: 5, disabled: false }}
        panning={{ velocityDisabled: false, allowLeftClickPan: true }}
        velocityAnimation={{ sensitivityTouch: 1, animationTime: 300 }}
      >
        {(utils) => (
          <>
            <Toolbar
              onFullscreen={toggleFullscreen}
              isFullscreen={fsActive}
              onClose={onClose}
              onScaleChange={(s) => (scaleRef.current = s)}
              hasWalkthrough={hasWalkthrough}
              walkthroughOpen={walkthroughOpen}
              onToggleWalkthrough={() =>
                walkthroughOpen ? exitWalkthrough() : onWalkthroughOpenChange(true)
              }
            />
            <KeyboardBridge
              onFullscreen={toggleFullscreen}
              utils={utils}
              walkthroughOpen={walkthroughOpen}
              onWalkthroughPrevious={() => setWalkthroughStepIndex((i) => Math.max(0, i - 1))}
              onWalkthroughNext={() =>
                setWalkthroughStepIndex((i) => Math.min(walkthroughTotal - 1, i + 1))
              }
            />
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%", touchAction: "none" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {svgMarkup && definition ? (
                <InteractiveDiagram
                  markup={svgMarkup}
                  definition={definition}
                  citations={citations}
                  walkthroughActive={walkthroughOpen}
                  walkthroughStepIndex={walkthroughStepIndex}
                  className="max-h-[100dvh] max-w-full select-none sm:max-h-[88dvh]"
                />
              ) : (
                <img
                  src={src}
                  alt={alt}
                  className="max-h-[100dvh] max-w-full select-none object-contain sm:max-h-[88dvh]"
                  draggable={false}
                />
              )}
            </TransformComponent>
            <OrientationRefit />
            {walkthroughOpen && walkthroughStep ? (
              <DiagramWalkthroughBar
                step={walkthroughStep}
                index={walkthroughStepIndex}
                total={walkthroughTotal}
                onPrevious={() => setWalkthroughStepIndex((i) => Math.max(0, i - 1))}
                onNext={() => setWalkthroughStepIndex((i) => Math.min(walkthroughTotal - 1, i + 1))}
                onExit={exitWalkthrough}
              />
            ) : (
              caption && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex"
                  aria-hidden
                >
                  <div className="pointer-events-auto max-w-3xl rounded-xl border border-border/60 bg-background/90 px-4 py-2.5 text-center text-sm text-muted-foreground shadow-md backdrop-blur">
                    <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">
                      {figureIndex ? `Figure ${figureIndex}` : "Diagram"}
                    </span>
                    {caption}
                  </div>
                </div>
              )
            )}
            <div
              className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur sm:flex"
              role="note"
              aria-hidden
            >
              <Move className="h-3.5 w-3.5" /> Drag to pan · scroll to zoom · double-click to zoom
              in · <kbd className="rounded bg-muted px-1">0</kbd> reset ·{" "}
              <kbd className="rounded bg-muted px-1">F</kbd> full-screen
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function Toolbar({
  onFullscreen,
  isFullscreen,
  onClose,
  onScaleChange,
  hasWalkthrough,
  walkthroughOpen,
  onToggleWalkthrough,
}: {
  onFullscreen: () => void;
  isFullscreen: boolean;
  onClose: () => void;
  onScaleChange?: (s: number) => void;
  hasWalkthrough?: boolean;
  walkthroughOpen?: boolean;
  onToggleWalkthrough?: () => void;
}) {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();
  const [pct, setPct] = useState(100);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  useTransformEffect(({ state }) => {
    setPct(Math.round(state.scale * 100));
    onScaleChange?.(state.scale);
  });

  // Land initial focus on Reset so keyboard users can immediately re-center.
  useEffect(() => {
    resetRef.current?.focus();
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Diagram zoom controls"
      aria-orientation="horizontal"
      className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10 flex items-center gap-0.5 rounded-full border border-border/60 bg-background/90 p-1 shadow-md backdrop-blur sm:right-3 sm:top-3 sm:gap-1"
    >
      {hasWalkthrough && (
        <>
          <ToolbarButton
            onClick={() => onToggleWalkthrough?.()}
            label={walkthroughOpen ? "Exit walkthrough" : "Start walkthrough"}
            pressed={walkthroughOpen}
          >
            <Sparkles className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
        </>
      )}
      <span
        className="hidden min-w-[3.25rem] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground sm:block"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Zoom level ${pct} percent`}
      >
        {pct}%
      </span>
      <ToolbarButton onClick={() => zoomOut()} label="Zoom out">
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => zoomIn()} label="Zoom in">
        <Plus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => centerView(undefined, 200, "easeOut")} label="Fit to view">
        <Scan className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => resetTransform()} label="Reset zoom" ref={resetRef}>
        <RotateCcw className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={onFullscreen}
        label={isFullscreen ? "Exit full-screen" : "Enter full-screen"}
        pressed={isFullscreen}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </ToolbarButton>
      <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
      <ToolbarButton onClick={onClose} label="Close diagram">
        <X className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

const ToolbarButton = forwardRef<
  HTMLButtonElement,
  { onClick: () => void; label: string; pressed?: boolean; children: React.ReactNode }
>(function ToolbarButton({ onClick, label, pressed, children }, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground sm:h-9 sm:w-9"
    >
      {children}
    </Button>
  );
});

function KeyboardBridge({
  onFullscreen,
  utils,
  walkthroughOpen,
  onWalkthroughPrevious,
  onWalkthroughNext,
}: {
  onFullscreen: () => void;
  utils: any;
  walkthroughOpen?: boolean;
  onWalkthroughPrevious?: () => void;
  onWalkthroughNext?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName))
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        utils.zoomIn?.();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        utils.zoomOut?.();
      } else if (e.key === "0") {
        e.preventDefault();
        utils.resetTransform?.();
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        utils.centerView?.(undefined, 200, "easeOut");
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        onFullscreen();
      } else if (walkthroughOpen && (e.key === "ArrowRight" || e.key.toLowerCase() === "n")) {
        e.preventDefault();
        onWalkthroughNext?.();
      } else if (walkthroughOpen && (e.key === "ArrowLeft" || e.key.toLowerCase() === "p")) {
        e.preventDefault();
        onWalkthroughPrevious?.();
      }
      // Escape is handled by DialogContent's onEscapeKeyDown (DiagramLightbox), not here — a raw
      // window-level listener can't reliably preempt Radix's own React-level Escape handling.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFullscreen, utils, walkthroughOpen, onWalkthroughPrevious, onWalkthroughNext]);
  return null;
}

function OrientationRefit() {
  const { resetTransform } = useControls();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resetTransform(180), 150);
    };
    window.addEventListener("orientationchange", refit);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("orientationchange", refit);
    };
  }, [resetTransform]);

  return null;
}
