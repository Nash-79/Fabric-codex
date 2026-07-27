import { ContentHero } from "@/components/ContentHero";
import type { ReaderHeroProps } from "./types";

// Tutorials reuse lesson_meta's prerequisites/completion_outcome fields rather than a separate
// schema. Renders nothing when lesson_meta is absent (most tutorial-archetype content today) or
// when the profile doesn't ask to surface prerequisites/outcomes — additive, never a regression.
export function TutorialReader({ item, presentationProfile, ...heroProps }: ReaderHeroProps) {
  const meta = item.lesson_meta;
  const showPrereqs = presentationProfile?.surface_prerequisites && meta?.prerequisites?.length;
  const showOutcome = presentationProfile?.surface_outcomes && meta?.completion_outcome;

  return (
    <>
      <ContentHero item={item} presentationProfile={presentationProfile} {...heroProps} />
      {(showPrereqs || showOutcome) && (
        <div className="mt-6 grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
          {showPrereqs && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Before you start
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {meta!.prerequisites.map((prereq) => (
                  <li key={prereq}>{prereq}</li>
                ))}
              </ul>
            </div>
          )}
          {showOutcome && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Outcome
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{meta!.completion_outcome}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
