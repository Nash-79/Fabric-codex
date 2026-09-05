import type { ReactElement, ReactNode } from "react";

// Render GitHub-style `> [!NOTE]` blockquotes as labeled callout cards. The [!INFERENCE] kind
// directly serves the domain rule that generated text must label its own inferences vs facts.
// Shared across articles, designs, and lessons — previously blog-only, but designs/lessons cite
// the same claim-grounding conventions and deserve the same treatment.

const calloutStyles: Record<string, { cls: string; label: string }> = {
  NOTE: {
    cls: "border-teal-500/30 bg-teal-500/10 text-teal-900 dark:text-teal-100",
    label: "Note",
  },
  TIP: {
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
    label: "Tip",
  },
  WARNING: {
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
    label: "Warning",
  },
  IMPORTANT: {
    cls: "border-indigo-500/30 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100",
    label: "Important",
  },
  INFERENCE: {
    cls: "border-violet-500/30 bg-violet-500/10 text-violet-900 dark:text-violet-100",
    label: "Inference (not a sourced fact)",
  },
  // Phase 4 teaching primitives (Editorial Experience Revamp) — same generic card path as above.
  CHECKPOINT: {
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100",
    label: "Checkpoint",
  },
  PREREQUISITE: {
    cls: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-900 dark:text-fuchsia-100",
    label: "Before you start",
  },
  RESULT: {
    cls: "border-lime-500/30 bg-lime-500/10 text-lime-950 dark:text-lime-100",
    label: "Expected result",
  },
  TAKEAWAY: {
    cls: "border-orange-500/30 bg-orange-500/10 text-orange-950 dark:text-orange-100",
    label: "Key takeaway",
  },
  DEFINITION: {
    cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-900 dark:text-zinc-100",
    label: "Definition",
  },
};

export function Callout({ children }: { children: ReactNode }) {
  const text = extractText(children);
  const match = text.match(
    /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|INFERENCE|QUOTE|CHECKPOINT|PREREQUISITE|RESULT|TAKEAWAY|DEFINITION|TRY-IT)\]\s*/i,
  );
  if (!match) {
    return (
      <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  }
  const kind = match[1].toUpperCase();
  if (kind === "QUOTE") {
    return (
      <blockquote className="not-prose my-8 border-none px-8 text-center">
        <div className="text-2xl font-medium leading-snug tracking-tight text-foreground [&_p]:m-0">
          {stripMarker(children, match[0])}
        </div>
      </blockquote>
    );
  }
  // Try-it exercises are a prompt-then-reveal pattern: layer Callout's styling on a native
  // <details> so the content stays in the DOM/print output even collapsed (no JS-only hiding).
  if (kind === "TRY-IT") {
    return (
      <details className="not-prose my-5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm leading-relaxed text-cyan-900 dark:text-cyan-100 [&_p]:m-0">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">
          Try it — reveal solution
        </summary>
        <div className="mt-2">{stripMarker(children, match[0])}</div>
      </details>
    );
  }
  const style = calloutStyles[kind] ?? calloutStyles.NOTE;
  return (
    <div className={`not-prose my-5 rounded-lg border p-4 text-sm leading-relaxed ${style.cls}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide">{style.label}</div>
      <div className="[&_p]:m-0">{stripMarker(children, match[0])}</div>
    </div>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in (node as any))
    return extractText((node as any).props?.children);
  return "";
}

// Remove the leading [!TYPE] marker text from the rendered children.
function stripMarker(node: ReactNode, marker: string): ReactNode {
  let removed = false;
  const walk = (n: ReactNode): ReactNode => {
    if (removed) return n;
    if (typeof n === "string") {
      if (n.includes(marker.trim())) {
        removed = true;
        return n.replace(marker, "").replace(marker.trim(), "");
      }
      return n;
    }
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === "object" && "props" in (n as any)) {
      const el = n as ReactElement<any>;
      return { ...el, props: { ...el.props, children: walk(el.props?.children) } };
    }
    return n;
  };
  return walk(node);
}
