import type { UIMessage } from "ai";

export type AdvisorContextSource = {
  id: string;
  label: string;
  title: string;
  url?: string | null;
  tier?: number | null;
  kind: "claim" | "source" | "content" | "topic" | "capability" | "diagram";
  ref?: string | null;
  summary?: string | null;
};

export type AdvisorMessageMetadata = {
  createdAt?: number;
  model?: string;
  retrievalStatus?: "retrieved" | "empty" | "error";
  contextSummary?: string;
  sources?: AdvisorContextSource[];
  totalTokens?: number;
};

export type AdvisorMessage = UIMessage<AdvisorMessageMetadata>;
