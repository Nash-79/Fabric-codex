import { ContentHero } from "@/components/ContentHero";
import type { ReaderHeroProps } from "./types";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
};

// Renders nothing when lesson_meta is null (content not yet authored through the lesson_meta
// schema) — additive, never a regression for existing lesson content.
export function LessonReader({ item, presentationProfile, ...heroProps }: ReaderHeroProps) {
  const meta = item.lesson_meta;

  return (
    <>
      <ContentHero item={item} presentationProfile={presentationProfile} {...heroProps} />
      {meta && (
        <div className="mt-6 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-medium">
              {LEVEL_LABEL[meta.level] ?? meta.level}
            </span>
            <span>~{meta.estimated_minutes} min</span>
          </div>
          {meta.objectives.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What you'll learn
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {meta.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </div>
          )}
          {presentationProfile?.surface_prerequisites && meta.prerequisites.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prerequisites
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {meta.prerequisites.map((prereq) => (
                  <li key={prereq}>{prereq}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
