import { ArrowUpRight } from "lucide-react";

export function AdvisorPromptCard({
  title,
  prompt,
  onSelect,
}: {
  title: string;
  prompt: string;
  onSelect: (prompt: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(prompt)}
      className="group flex min-h-28 flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{prompt}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
        Use prompt
        <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
      </span>
    </button>
  );
}
