export type ContentItemKind = "article" | "design" | "lesson";

const KIND_META: Record<ContentItemKind, { label: string; cls: string }> = {
  article: { label: "Article", cls: "border-teal-500/30 bg-teal-500/10 text-teal-200" },
  design: { label: "Architecture", cls: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200" },
  lesson: { label: "Lesson", cls: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
};

export function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind as ContentItemKind] ?? KIND_META.article;
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
