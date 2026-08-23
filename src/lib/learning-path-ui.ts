// Pure logic behind /learn's path rendering (WP1.4, docs/plan/phase-1-curriculum.md), split out
// so the resume/lock semantics are unit-testable without rendering the route.

import type { LearningPathItem } from "@/lib/atlas.functions";

export type ProgressEntry = { status: "in_progress" | "completed"; percent: number };

export function itemKey(item: LearningPathItem) {
  return `${item.content_kind}:${item.content_slug}`;
}

export function isItemDone(entry: ProgressEntry | undefined) {
  return entry?.status === "completed";
}

/** First not-done item, in position order — where "resume" or a fresh start lands. */
export function findResumeItem(
  items: LearningPathItem[],
  progressByKey: Map<string, ProgressEntry>,
) {
  return items.find((item) => !isItemDone(progressByKey.get(itemKey(item)))) ?? items[0] ?? null;
}

/**
 * An item is locked only by its position in ITS OWN path — an unmet prerequisite from
 * lesson_meta additionally shows as a hint, but never blocks navigation (a reader can always jump
 * ahead; "locked" here means "not next", not "inaccessible").
 */
export function isPositionLocked(
  items: LearningPathItem[],
  index: number,
  progressByKey: Map<string, ProgressEntry>,
) {
  if (index === 0) return false;
  const prior = items[index - 1];
  return !isItemDone(progressByKey.get(itemKey(prior)));
}
