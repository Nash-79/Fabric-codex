import { useState } from "react";
import { ContentFeedbackButton } from "@/components/ContentFeedbackButton";
import { useActiveHeading, type TocEntry } from "@/components/ContentTocSidebar";

// An always-visible (not hover-gated) per-section feedback affordance, additive to the inline
// per-heading trigger in ContentItemArticle — that one is discoverable once you know to hover/tap
// a heading; this one is a persistent rail so the capability is visible without any interaction at
// all. Fixed to the viewport edge rather than a grid column so it never disturbs the existing
// [TopicTree] [ToC | article | Citations] three-column layout in the route. Each dot drives
// ContentFeedbackButton's dialog externally (open/onOpenChange, hideDefaultTrigger) rather than
// forking a second dialog/submission implementation for this second trigger surface.
export function ContentFeedbackRail({
  contentItemId,
  headings,
  reportedSectionIds,
}: {
  contentItemId: string;
  /** Top-level (##) headings only — same set ContentTocSidebar navigates between. */
  headings: TocEntry[];
  reportedSectionIds: Set<string>;
}) {
  const activeId = useActiveHeading(headings);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!headings.length) return null;

  return (
    <div
      className="no-print fixed right-2 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-1.5 xl:flex"
      role="group"
      aria-label="Give feedback on a section"
    >
      {headings.map((h) => {
        const active = h.id === activeId;
        const reported = reportedSectionIds.has(h.id);
        return (
          <div key={h.id} className="relative">
            <button
              type="button"
              title={h.title}
              aria-label={`Give feedback on: ${h.title}`}
              onClick={() => setOpenId(h.id)}
              className={`flex h-2.5 w-2.5 rounded-full border transition hover:scale-125 ${
                active
                  ? "border-teal-400 bg-teal-400"
                  : reported
                    ? "border-teal-500/60 bg-teal-500/40"
                    : "border-border bg-card hover:border-teal-400"
              }`}
            />
            <ContentFeedbackButton
              contentItemId={contentItemId}
              sections={headings}
              defaultSectionId={h.id}
              variant="inline"
              alreadyReported={reported}
              hideDefaultTrigger
              open={openId === h.id}
              onOpenChange={(next) => setOpenId(next ? h.id : null)}
            />
          </div>
        );
      })}
    </div>
  );
}
