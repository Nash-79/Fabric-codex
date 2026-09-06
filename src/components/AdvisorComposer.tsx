import { useEffect, useRef } from "react";
import type { ChatStatus } from "ai";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export function AdvisorComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  status,
  focusKey,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled?: boolean;
  status?: ChatStatus;
  focusKey?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus on mount and whenever focusKey (e.g. thread id / after-send) changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusKey]);

  return (
    <PromptInput
      onSubmit={(msg, event) => {
        event.preventDefault();
        if (!msg.text.trim()) return;
        onSubmit();
      }}
      aria-label="Ask the Fabric Codex Advisor"
    >
      <PromptInputTextarea
        ref={textareaRef as any}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask about Fabric architecture, code patterns, governance, Direct Lake, capacity…"
      />
      <PromptInputFooter>
        <PromptInputTools>
          <span className="text-[11px] text-muted-foreground">
            Enter to send · Shift+Enter for newline · Answers cite Atlas sources
          </span>
        </PromptInputTools>
        <PromptInputSubmit status={status} onStop={onStop} disabled={disabled || !value.trim()} />
      </PromptInputFooter>
    </PromptInput>
  );
}
