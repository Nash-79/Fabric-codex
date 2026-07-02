import { type ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";

// Thin alias kept for the Advisor call sites — articles and the Advisor now share the same
// fenced-code panel (language chip + copy button) from components/CodeBlock.
export function AdvisorCodeBlock({ children }: { children: ReactNode }) {
  return <CodeBlock>{children}</CodeBlock>;
}
