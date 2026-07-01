import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  Database,
  PanelRightOpen,
  Sparkles,
  Trash2,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  MessageSquare,
  History,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdvisorComposer } from "@/components/AdvisorComposer";
import { AdvisorMessage } from "@/components/AdvisorMessage";
import { AdvisorPromptCard } from "@/components/AdvisorPromptCard";
import { AdvisorSourcePanel } from "@/components/AdvisorSourcePanel";
import { SiteHeader } from "@/components/SiteHeader";
import { ADVISOR_MODELS, DEFAULT_ADVISOR_MODEL, ADVISOR_MODEL_IDS } from "@/lib/advisor-models";
import { advisorMessageText } from "@/lib/advisor-message";
import type { AdvisorMessage as AdvisorMessageType } from "@/lib/advisor-types";
import { isToday, isYesterday, subDays } from "date-fns";
import { toast } from "sonner";

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

const THREADS_KEY = "fa.advisor.threads";
const ACTIVE_THREAD_ID_KEY = "fa.advisor.active_thread_id";
const MODEL_KEY = "fa.advisor.model";

interface ChatThread {
  id: string;
  title: string;
  messages: AdvisorMessageType[];
  modelId: string;
  createdAt: number;
}

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

function loadThreads(): ChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (raw) return JSON.parse(raw) as ChatThread[];

    // Migrate old messages v2 if they exist
    const oldMessagesRaw =
      window.localStorage.getItem("fa.advisor.messages.v2") ??
      window.localStorage.getItem("fa.advisor.messages.v1");
    if (oldMessagesRaw) {
      const oldMessages = JSON.parse(oldMessagesRaw) as AdvisorMessageType[];
      if (oldMessages.length > 0) {
        const firstUser = oldMessages.find((m) => m.role === "user");
        const text =
          firstUser?.parts
            ?.map((p: any) => (p.type === "text" ? p.text : ""))
            .join(" ")
            .trim() ?? "Saved Chat";
        const title = text.slice(0, 35) + (text.length > 35 ? "..." : "");

        const newThread: ChatThread = {
          id: `thread-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title,
          messages: oldMessages,
          modelId: loadModel(),
          createdAt: Date.now(),
        };
        const threads = [newThread];
        window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads));

        // Clean up old storage keys
        window.localStorage.removeItem("fa.advisor.messages.v2");
        window.localStorage.removeItem("fa.advisor.messages.v1");
        return threads;
      }
    }
    return [];
  } catch (e) {
    console.error("Failed to load threads:", e);
    return [];
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function groupThreads(threads: ChatThread[]): [string, ChatThread[]][] {
  const groups: Record<string, ChatThread[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    Older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = subDays(startOfToday, 7);

  threads.forEach((t) => {
    const date = new Date(t.createdAt);
    if (date >= startOfToday) {
      groups["Today"].push(t);
    } else if (date >= startOfYesterday) {
      groups["Yesterday"].push(t);
    } else if (date >= sevenDaysAgo) {
      groups["Previous 7 Days"].push(t);
    } else {
      groups["Older"].push(t);
    }
  });

  return Object.entries(groups).filter(([_, items]) => items.length > 0);
}

function AdvisorPage() {
  const search = Route.useSearch();
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return "new";
    const loaded = loadThreads();
    const stored = window.localStorage.getItem(ACTIVE_THREAD_ID_KEY);
    if (stored && loaded.some((t) => t.id === stored)) return stored;
    return loaded.length > 0 ? loaded[0].id : "new";
  });

  const [initial] = useState<AdvisorMessageType[]>(() => {
    const loaded = loadThreads();
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_THREAD_ID_KEY) : null;
    const activeId =
      stored && loaded.some((t) => t.id === stored)
        ? stored
        : loaded.length > 0
          ? loaded[0].id
          : "new";
    if (activeId === "new") return [];
    return loaded.find((t) => t.id === activeId)?.messages ?? [];
  });

  const [modelId, setModelId] = useState<string>(() => loadModel());
  const [input, setInput] = useState(search.prompt ?? "");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1024;
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (search.prompt) setInput(search.prompt);
  }, [search.prompt]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_KEY, modelId);
    }
  }, [modelId]);

  useEffect(() => {
    if (typeof window !== "undefined" && activeThreadId) {
      window.localStorage.setItem(ACTIVE_THREAD_ID_KEY, activeThreadId);
    }
  }, [activeThreadId]);

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

  // Synchronize active thread messages with useChat messages
  useEffect(() => {
    if (!activeThreadId || activeThreadId === "new") return;

    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === activeThreadId);
      if (idx === -1) return prev;

      const currentThread = prev[idx];
      if (JSON.stringify(currentThread.messages) === JSON.stringify(messages)) {
        return prev;
      }

      const updated = [...prev];
      updated[idx] = {
        ...currentThread,
        messages,
        modelId,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(THREADS_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  }, [messages, activeThreadId, modelId]);

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
  const sources = sourceMetadata?.sources ?? [];
  const statusText =
    status === "submitted"
      ? "Retrieving sources"
      : status === "streaming"
        ? "Writing answer"
        : "Ready";

  // Autohide sources panel when empty, or auto-open on desktop when sources become available
  useEffect(() => {
    if (sources.length === 0) {
      setSourcesOpen(false);
    } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSourcesOpen(true);
    }
  }, [sources.length]);

  async function submit(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");

    let currentId = activeThreadId;
    if (!currentId || currentId === "new") {
      const newId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const title = trimmed.slice(0, 35) + (trimmed.length > 35 ? "..." : "");
      const newThread: ChatThread = {
        id: newId,
        title,
        messages: [],
        modelId,
        createdAt: Date.now(),
      };

      const updatedThreads = [newThread, ...threads];
      setThreads(updatedThreads);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THREADS_KEY, JSON.stringify(updatedThreads));
      }

      setActiveThreadId(newId);
      currentId = newId;
      setMessages([]);
    }

    await sendMessage({ text: trimmed });
  }

  function changeActiveThread(id: string, currentThreads = threads) {
    if (isLoading) {
      stop();
    }
    setActiveThreadId(id);
    if (id === "new") {
      setMessages([]);
    } else {
      const thread = currentThreads.find((t) => t.id === id);
      if (thread) {
        setMessages(thread.messages);
        if (thread.modelId) {
          setModelId(thread.modelId);
        }
      }
    }
  }

  function deleteThread(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    const threadToDelete = threads.find((t) => t.id === id);
    if (!threadToDelete) return;

    const updatedThreads = threads.filter((t) => t.id !== id);
    setThreads(updatedThreads);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THREADS_KEY, JSON.stringify(updatedThreads));
    }

    if (activeThreadId === id) {
      const nextActiveId = updatedThreads.length > 0 ? updatedThreads[0].id : "new";
      changeActiveThread(nextActiveId, updatedThreads);
    }

    toast("Conversation deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          setThreads((prev) => {
            const restored = [threadToDelete, ...prev].sort((a, b) => b.createdAt - a.createdAt);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(THREADS_KEY, JSON.stringify(restored));
            }
            return restored;
          });
          changeActiveThread(id, [threadToDelete, ...updatedThreads]);
        },
      },
    });
  }

  function clearConversation() {
    setMessages([]);
    if (activeThreadId && activeThreadId !== "new") {
      setThreads((prev) => {
        const updated = prev.map((t) => (t.id === activeThreadId ? { ...t, messages: [] } : t));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(THREADS_KEY, JSON.stringify(updated));
        }
        return updated;
      });
    }
  }

  const grouped = groupThreads(threads);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <SiteHeader />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Collapsible History Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out lg:static lg:h-[calc(100vh-3.5rem)] ${
            sidebarOpen
              ? "w-64 translate-x-0 opacity-100"
              : "w-0 -translate-x-full opacity-0 pointer-events-none overflow-hidden border-r-0"
          }`}
        >
          <div className="flex h-14 items-center justify-between px-3 border-b border-sidebar-border/40 shrink-0">
            <button
              onClick={() => changeActiveThread("new")}
              className="flex flex-1 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar/50 px-3 py-2 text-xs font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-2 rounded-lg p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:inline-block hidden transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-2 rounded-lg p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden transition-colors"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {grouped.map(([groupName, items]) => (
              <div key={groupName} className="space-y-1">
                <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {groupName}
                </h3>
                {items.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  return (
                    <div
                      key={thread.id}
                      onClick={() => changeActiveThread(thread.id)}
                      className={`group relative flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/85"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-6">
                        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                        <span className="truncate">{thread.title}</span>
                      </div>
                      <button
                        onClick={(e) => deleteThread(thread.id, e)}
                        className="absolute right-2 rounded p-1 opacity-0 hover:bg-destructive/20 hover:text-destructive-foreground group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {threads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground/60">
                <History className="h-8 w-8 mb-2 opacity-40" />
                No chat history yet.
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          className={`grid min-h-0 flex-1 h-full overflow-hidden transition-all duration-300 ${
            sourcesOpen && sources.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"
          }`}
        >
          <section
            className="flex min-w-0 flex-col h-full max-h-full overflow-hidden bg-background"
            aria-label="Fabric Atlas Advisor chat"
          >
            <div className="border-b border-border bg-background shrink-0">
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
                      Answers retrieve verified claims plus related blogs, designs, lessons,
                      sources, topics, capabilities, and diagrams. Unsupported facts are refused
                      rather than guessed.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!sidebarOpen && (
                      <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                        aria-label="Open chat history"
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                        History
                      </button>
                    )}
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
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                      aria-label="Toggle sources panel"
                    >
                      <PanelRightOpen className="h-3.5 w-3.5" />
                      Sources
                    </button>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={clearConversation}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
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

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-background">
              <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
                {messages.length === 0 ? (
                  <div className="py-8">
                    <div className="max-w-2xl">
                      <h2 className="text-lg font-semibold text-foreground">
                        Start with a grounded question
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Ask for a plain-language explanation, a design review, a comparison, or
                        code. The Advisor will cite approved claims and show the retrieved context.
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

            <div className="border-t border-border bg-background/95 p-4 shrink-0">
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
            open={sourcesOpen && sources.length > 0}
            onOpenChange={setSourcesOpen}
            sources={sources}
            summary={sourceMetadata?.contextSummary}
          />
        </main>
      </div>
    </div>
  );
}
