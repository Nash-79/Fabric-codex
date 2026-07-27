import { ContentHero } from "@/components/ContentHero";
import type { ReaderHeroProps } from "./types";

// Guards against constraints's publish-time default of {} — render nothing rather than an
// empty box when a design hasn't actually populated scenario/constraints yet.
export function ArchitectureReader({ item, presentationProfile, ...heroProps }: ReaderHeroProps) {
  const constraintEntries = Object.entries(item.constraints ?? {});
  const hasScenario = Boolean(item.scenario?.trim());
  const hasConstraints = constraintEntries.length > 0;

  return (
    <>
      <ContentHero item={item} presentationProfile={presentationProfile} {...heroProps} />
      {(hasScenario || hasConstraints) && (
        <div className="mt-6 grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
          {hasScenario && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scenario
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.scenario}</p>
            </div>
          )}
          {hasConstraints && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Constraints
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {constraintEntries.map(([key, value]) => (
                  <li key={key}>
                    <span className="font-medium text-foreground">{key}:</span> {String(value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
