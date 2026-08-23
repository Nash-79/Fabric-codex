// The merge/never-downgrade logic behind upsertMyProgress and mergeLocalProgress
// (atlas.functions.ts), split out so it's unit-testable against a plain object the same way
// content-siblings.services.server.ts and atlas-publish.services.server.ts are.
//
// D3 (docs/plan/phase-1-curriculum.md WP1.2): server-side progress must never let a merge or a
// duplicate/out-of-order write erase progress a reader already has, whether that's an existing
// server row or a device's local completion being merged in for the first time.

export type ProgressRow = {
  content_kind: "article" | "design" | "lesson";
  content_slug: string;
  status: "in_progress" | "completed";
  percent: number;
  completed_at: string | null;
  updated_at: string;
};

export type ExistingProgress = {
  status: "in_progress" | "completed";
  percent: number;
  completed_at: string | null;
};

/**
 * True when `existing` already represents more progress than `incoming` — i.e. applying
 * `incoming` would be a regression. A completed row is never "behind" an in-progress one
 * regardless of percent (percent is a secondary signal once something is marked done).
 */
export function isRegression(
  existing: ExistingProgress,
  incoming: { status: "in_progress" | "completed"; percent: number },
): boolean {
  if (existing.status === "completed" && incoming.status !== "completed") return true;
  if (existing.status === incoming.status) return existing.percent > incoming.percent;
  return false;
}

/** Union + max merge of one local row against its existing server row (if any). */
export function mergeRow(
  local: ProgressRow,
  server: ExistingProgress | undefined,
  nowIso: string,
): Omit<ProgressRow, "content_kind" | "content_slug"> & {
  content_kind: ProgressRow["content_kind"];
  content_slug: string;
} {
  if (!server) return { ...local, updated_at: nowIso };
  const status: ProgressRow["status"] =
    server.status === "completed" || local.status === "completed" ? "completed" : "in_progress";
  const percent = Math.max(server.percent, local.percent);
  const completedAtCandidates = [server.completed_at, local.completed_at].filter(
    Boolean,
  ) as string[];
  const completed_at = completedAtCandidates.length ? completedAtCandidates.sort()[0] : null;
  return {
    content_kind: local.content_kind,
    content_slug: local.content_slug,
    status,
    percent,
    completed_at,
    updated_at: nowIso,
  };
}

/** Merges every local row against a map of existing server rows keyed by "kind:slug". */
export function mergeLocalRows(
  localRows: ProgressRow[],
  existingByKey: Map<string, ExistingProgress>,
  nowIso: string,
) {
  return localRows.map((local) => {
    const key = `${local.content_kind}:${local.content_slug}`;
    return mergeRow(local, existingByKey.get(key), nowIso);
  });
}
