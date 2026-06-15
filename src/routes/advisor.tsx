import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/advisor")({
  head: () => ({
    meta: [
      { title: "Advisor — Fabric Atlas" },
      { name: "description", content: "Grounded chat over the Fabric Atlas knowledge base. Every answer cites approved sources." },
    ],
  }),
  component: AdvisorPage,
});

const STORAGE_KEY = "fa.advisor.messages.v1";

function AdvisorPage() {
  const [initial] = useState<UIMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UIMessage[]) : [];
    } catch {
      return [];
    }
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: "advisor",
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => { if (status === "ready") taRef.current?.focus(); }, [status]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <header className="mb-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">Grounded Advisor</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Ask the atlas</h1>
          <p className="mt-2 text-sm text-white/55">
            The Advisor retrieves cited claims from the knowledge base. It will refuse where the atlas is silent and label inferences.
          </p>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); window.localStorage.removeItem(STORAGE_KEY); }}
              className="mt-3 text-xs text-white/45 hover:text-white"
            >
              Clear conversation
            </button>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {messages.length === 0 && (
            <div className="text-sm text-white/45">
              Try: <em>“When does Direct Lake fall back to DirectQuery?”</em> or <em>“What are OneLake shortcut limits?”</em>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts
              .map((p: any) => (p.type === "text" ? p.text : ""))
              .join("");
            const mine = m.role === "user";
            return (
              <div key={m.id} className={mine ? "ml-auto max-w-[85%]" : "max-w-[95%]"}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  mine ? "bg-teal-500/15 text-white" : "bg-white/[0.04] text-white/90"
                }`}>
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-a:text-teal-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "…"}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}
          {status === "submitted" && (
            <div className="text-xs text-white/40">Retrieving from the atlas…</div>
          )}
          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error.message}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="mt-4 flex items-end gap-2">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as any); } }}
            rows={2}
            placeholder="Ask about OneLake, Direct Lake, capacity, governance…"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <button
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#070b16] hover:bg-white/90 disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
