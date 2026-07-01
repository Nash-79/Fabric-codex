import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";

export function AdvisorComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <form
      className="rounded-xl border border-border bg-card p-2 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      aria-label="Ask the Fabric Atlas Advisor"
    >
      <label htmlFor="advisor-message" className="sr-only">
        Message
      </label>
      <textarea
        id="advisor-message"
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder="Ask about Fabric architecture, code patterns, governance, Direct Lake, capacity..."
        className="max-h-44 min-h-12 w-full resize-none rounded-lg bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-1 pb-1">
        <p className="text-xs text-muted-foreground">
          Enter sends, Shift+Enter adds a line. Advisor cites approved Atlas sources.
        </p>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Stop generation"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
