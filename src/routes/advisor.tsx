import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Database, PanelRightOpen, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdvisorComposer } from "@/components/AdvisorComposer";
import { AdvisorMessage } from "@/components/AdvisorMessage";
import { AdvisorPromptCard } from "@/components/AdvisorPromptCard";
import { AdvisorSourcePanel } from "@/components/AdvisorSourcePanel";
import { SiteHeader } from "@/components/SiteHeader";
import { ADVISOR_MODELS, DEFAULT_ADVISOR_MODEL, ADVISOR_MODEL_IDS } from "@/lib/advisor-models";
import { advisorMessageText } from "@/lib/advisor-message";
import type { AdvisorMessage as AdvisorMessageType } from "@/lib/advisor-types";

type AdvisorSearch = { prompt?: string };

export const Route = createFileRoute("/advisor")({
  validateSearch: (search: Record<string, unknown>): AdvisorSearch => ({
    prompt: typeof search.prompt === "string" ? search.prompt.slice(0, 1000) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Advisor — Fabric Atlas" },
      {
        name: "description",
        content:
          "Grounded chat over the Fabric Atlas knowledge base. Every answer cites approved sources.",
      },
    ],
  }),
  component: AdvisorPage,
});

const STORAGE_KEY = "fa.advisor.messages.v2";
const OLD_STORAGE_KEY = "fa.advisor.messages.v1";
const MODEL_KEY = "fa.advisor.model";

const TIER_LABEL: Record<string, string> = {
  cheap: "Fast",
  moderate: "Balanced",
  expensive: "Deep",
};

const TIER_DOT: Record<string, string> = {
  cheap: "bg-emerald-500",
  moderate: "bg-amber-500",
  expensive: "bg-rose-500",
};

const STARTERS = [
  {
    title: "Explain a concept",
    prompt: "Explain Direct Lake fallback in beginner, practitioner, and architect terms.",
  },
  {
    title: "Compare options",
    prompt: "Compare Lakehouse, Warehouse, and SQL database in Fabric for an analytics workload.",
  },
  {
    title: "Review a design",
    prompt:
      "What should I check before using OneLake shortcuts across workspaces in a governed design?",
  },
  {
    title: "Generate examples",
    prompt: "Show a practical PySpark or SQL example for an approved Fabric performance pattern.",
  },
];

function loadModel(): string {
  if (typeof window === "undefined") return DEFAULT_ADVISOR_MODEL;
  const stored = window.localStorage.getItem(MODEL_KEY) ?? "";
  return ADVISOR_MODEL_IDS.has(stored) ? stored : DEFAULT_ADVISOR_MODEL;
}

function loadMessages(): AdvisorMessageType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(OLD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdvisorMessageType[]) : [];
  } catch {
    return [];
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function AdvisorPage() {
  const search = Route.useSearch();
  const [initial] = useState<AdvisorMessageType[]>(() => loadMessages());
  const [modelId, setModelId] = useState<string>(() => loadModel());
  const [input, setInput] = useState(search.prompt ?? "");
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (search.prompt) setInput(search.prompt);
  }, [search.prompt]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(MODEL_KEY, modelId);
  }, [modelId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AdvisorMessageType>({
        api: "/api/chat",
        body: () => ({ model: modelId }),
      }),
    [modelId],
  );

  const { messages, sendMessage, regenerate, stop, status, error, setMessages } =
    useChat<AdvisorMessageType>({
      id: "advisor",
      messages: initial,
      transport,
    });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      window.localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      // Local persistence is best-effort; the chat remains usable without it.
    }
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";
  const activeModel = ADVISOR_MODELS.find((m) => m.id === modelId) ?? ADVISOR_MODELS[1];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const lastAssistantId = lastAssistant?.id;
  const sourceMetadata = lastAssistant?.metadata;
  const statusText =
    status === "submitted"
      ? "Retrieving sources"
      : status === "streaming"
        ? "Writing answer"
        : "Ready";

  async function submit(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    setSourcesOpen(true);
    await sendMessage({ text: trimmed });
  }

  function clearConversation() {
    setMessages([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(OLD_STORAGE_KEY);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="grid min-h-[calc(100vh-3.5rem)] flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col" aria-label="Fabric Atlas Advisor chat">
          <div className="border-b border-border bg-background">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
                    <Bot className="h-4 w-4" />
                    Grounded Advisor
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                    Ask Fabric Atlas
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Answers retrieve verified claims plus related blogs, designs, lessons, sources,
                    topics, capabilities, and diagrams. Unsupported facts are refused rather than
                    guessed.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Model</span>
                    <select
                      value={modelId}
                      onChange={(event) => setModelId(event.target.value)}
                      className="max-w-56 bg-transparent text-xs text-foreground focus:outline-none"
                      aria-label="Advisor model"
                    >
                      {ADVISOR_MODELS.map((model) => (
                        <option key={model.id} value={model.id} className="bg-card">
                          {model.label} — {model.hint}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${TIER_DOT[activeModel.tier]}`}
                      aria-hidden="true"
                    />
                    {TIER_LABEL[activeModel.tier]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSourcesOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Toggle sources panel"
                  >
                    <PanelRightOpen className="h-3.5 w-3.5" />
                    Sources
                  </button>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={clearConversation}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Clear conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
                  <Database className="h-3.5 w-3.5" />
                  RAG over all Atlas content
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  {statusText}
                  {isLoading && (
                    <span className="ml-1 inline-flex gap-0.5 motion-reduce:hidden">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
                    </span>
                  )}
                </span>
                {sourceMetadata?.contextSummary && (
                  <span className="rounded-md border border-border bg-card px-2 py-1">
                    {sourceMetadata.contextSummary}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
              {messages.length === 0 ? (
                <div className="py-8">
                  <div className="max-w-2xl">
                    <h2 className="text-lg font-semibold text-foreground">
                      Start with a grounded question
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Ask for a plain-language explanation, a design review, a comparison, or code.
                      The Advisor will cite approved claims and show the retrieved context.
                    </p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {STARTERS.map((starter) => (
                      <AdvisorPromptCard
                        key={starter.title}
                        title={starter.title}
                        prompt={starter.prompt}
                        onSelect={(prompt) => {
                          setInput(prompt);
                          submit(prompt);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <AdvisorMessage
                      key={message.id}
                      message={message}
                      isLastAssistant={message.id === lastAssistantId}
                      onRetry={() => regenerate()}
                    />
                  ))}
                  {status === "submitted" && (
                    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                      Retrieving verified claims, blogs, designs, lessons, sources, topics, and
                      diagrams...
                    </div>
                  )}
                  {error && (
                    <div
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200"
                      role="alert"
                    >
                      {error.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-border bg-background/95 p-4">
            <div className="mx-auto w-full max-w-5xl">
              <AdvisorComposer
                value={input}
                onChange={setInput}
                onSubmit={() => submit()}
                onStop={stop}
                busy={isLoading}
                disabled={isLoading}
              />
              {lastAssistant && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Last answer: {advisorMessageText(lastAssistant).length.toLocaleString()} chars.
                  Use Copy or Retry on the response toolbar.
                </div>
              )}
            </div>
          </div>
        </section>

        <AdvisorSourcePanel
          open={sourcesOpen}
          onOpenChange={setSourcesOpen}
          sources={sourceMetadata?.sources ?? []}
          summary={sourceMetadata?.contextSummary}
        />
      </main>
    </div>
  );
}
