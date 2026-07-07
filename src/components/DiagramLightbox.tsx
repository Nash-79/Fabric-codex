import { useState, useRef, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Module-level cache of natural aspect ratios so revisiting an image doesn't
// re-run the reflow after decode.
const ratioCache = new Map<string, number>();

export function DiagramLightbox({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState<number | null>(() => ratioCache.get(src) ?? null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth && !ratio) {
      const r = img.naturalWidth / img.naturalHeight;
      ratioCache.set(src, r);
      setRatio(r);
    }
  }, [src, ratio]);

  // Reserve vertical space up-front so streaming images don't push text down
  // as the user scrolls — kills the "shaking" jitter on mobile.
  const aspectRatio = ratio ?? 16 / 9;

  return (
    <>
      <figure className="not-prose article-figure group my-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/20 transition-colors hover:border-teal-500/40"
          style={{ aspectRatio: `${aspectRatio}` }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
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
          <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" /> Click to zoom
          </span>
        </button>
        {caption && (
          <figcaption className="mt-3 text-center text-sm italic text-muted-foreground">
            {caption}
          </figcaption>
        )}
      </figure>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] gap-0 overflow-hidden bg-background p-0 sm:rounded-xl">
          <DialogTitle className="sr-only">{alt || caption || "Diagram"}</DialogTitle>
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
              <img src={src} alt={alt} className="max-h-[85vh] w-auto" />
            </TransformComponent>
          </TransformWrapper>
          {caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-background/90 px-6 py-3 text-center text-sm text-muted-foreground">
              {caption}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
