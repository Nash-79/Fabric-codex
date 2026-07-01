import { useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

  return (
    <>
      <figure className="not-prose group my-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/20 transition hover:border-teal-500/40 hover:shadow-teal-500/10"
        >
          <img src={src} alt={alt} className="w-full" loading="lazy" />
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" /> Click to zoom
          </span>
        </button>
        {caption && (
          <figcaption className="mt-3 text-center text-sm text-muted-foreground">
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
