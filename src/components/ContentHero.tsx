import { KindBadge } from "@/components/KindBadge";
import { MaturityBadge } from "@/components/Badges";
import { readingTime } from "@/lib/reading-time";
import { ShieldCheck, Layers, FileText } from "lucide-react";

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
}: {
  item: {
    kind: string;
    title: string;
    summary?: string | null;
    body_md?: string | null;
    depth_levels?: number[] | null;
    tags?: string[] | null;
  };
  citationCount: number;
  diagramCount: number;
  hasPreview: boolean;
}) {
  return (
    <div className="relative -mx-6 px-6 pb-2 pt-2 sm:-mx-8 sm:px-8">
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
        <span>{readingTime(item.body_md ?? "")} min read</span>
        <span>·</span>
        <span>{citationCount} sources</span>
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

      {item.summary && (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{item.summary}</p>
      )}

      <div className="mt-8 grid gap-2 border-t border-border pt-6 sm:grid-cols-3">
        <StatCard
          icon={ShieldCheck}
          label="Citation policy"
          value="Every factual claim cites a source"
        />
        <StatCard
          icon={Layers}
          label="Depth range"
          value={item.depth_levels?.length ? `L${item.depth_levels.join(" · L")}` : "L1 · L5"}
        />
        <StatCard
          icon={FileText}
          label="Format"
          value={FORMAT_LABEL[item.kind] ?? "Source-grounded content"}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden="true" />
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xs font-medium text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}
