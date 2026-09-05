import { KindBadge } from "@/components/KindBadge";
import { MaturityBadge } from "@/components/Badges";
import { readingTime } from "@/lib/reading-time";
import { ShieldCheck } from "lucide-react";
import type { accent as accentFn } from "@/lib/fabric-theme";
import type { PresentationProfile } from "@/lib/content-presentation";

const FORMAT_LABEL: Record<string, string> = {
  article: "Source-grounded article",
  design: "Cited solution architecture",
  lesson: "Grounded lesson",
};

export function ContentHero({
  item,
  citationCount,
  diagramCount,
  hasPreview,
  presentationProfile,
  accent,
}: {
  item: {
    kind: string;
    title: string;
    summary?: string | null;
    body_md?: string | null;
    depth_levels?: number[] | null;
    tags?: string[] | null;
    updated_at?: string | null;
    version?: number | null;
  };
  citationCount: number;
  diagramCount: number;
  hasPreview: boolean;
  /** presentation_profile — drives hero_treatment (data-hero) and archetype (data-archetype). */
  presentationProfile?: PresentationProfile | null;
  /** Resolved via fabric-theme's accent(): presentation_profile.accent, falling back to the
      topic/capability's accent when unset. */
  accent?: ReturnType<typeof accentFn>;
}) {
  const heroTreatment = presentationProfile?.hero_treatment ?? "standard";
  return (
    // Bleed only from sm up — at phone widths the column already fills the viewport, so a
    // negative margin overflows the page sideways.
    <div
      className="relative pb-2 pt-2 sm:-mx-8 sm:px-8"
      data-archetype={presentationProfile?.archetype}
      data-hero={heroTreatment}
    >
      {heroTreatment === "diagram-led" && accent && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b ${accent.grad}`}
        />
      )}
      <div className="flex items-center gap-2">
        <KindBadge kind={item.kind} />
        {item.tags?.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
        {item.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {item.updated_at && (
          <>
            <time dateTime={item.updated_at}>
              Updated{" "}
              {new Date(item.updated_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            {(item.version ?? 1) > 1 && <span>(v{item.version})</span>}
            <span>·</span>
          </>
        )}
        <span>{readingTime(item.body_md ?? "")} min read</span>
        <span>·</span>
        <span>{citationCount} sources</span>
        {citationCount > 0 && (
          <>
            <span>·</span>
            <span>{citationCount} sources</span>
          </>
        )}
        {diagramCount > 0 && (
          <>
            <span>·</span>
            <span>{diagramCount} diagrams</span>
          </>
        )}
        {hasPreview && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <MaturityBadge maturity="preview" />
              covers preview features
            </span>
          </>
        )}
      </div>

      {heroTreatment !== "minimal" && item.summary && (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{item.summary}</p>
      )}

      {heroTreatment !== "minimal" && (
        <div
          className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground"
          style={{
            borderColor: "var(--surface-card-border)",
          }}
        >
          <span>
            Depth{" "}
            <strong className="font-medium text-foreground">
              {item.depth_levels?.length ? `L${item.depth_levels.join(" · L")}` : "L1 · L5"}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          {Boolean(item.depth_levels?.length) && (
            <>
              <span>
                Depth{" "}
                <strong className="font-medium text-foreground">
                  {`L${item.depth_levels!.join(" · L")}`}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{FORMAT_LABEL[item.kind] ?? "Source-grounded content"}</span>
          <details className="group ml-auto">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden="true" />
              Citation policy
            </summary>
            <p className="mt-1.5 max-w-prose text-muted-foreground">
              Every factual claim cites a source.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
