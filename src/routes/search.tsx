import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { searchAll } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { DepthBadge, TierBadge } from "@/components/Badges";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — Fabric Atlas" }] }),
  component: SearchPage,
});

function SearchPage() {
  const fn = useServerFn(searchAll);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchAll>> | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fn({ data: { q } });
      setResults(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Search</h1>
        <p className="mt-2 text-sm text-white/55">
          Search across topics, articles, claims, and sources.
        </p>
        <form onSubmit={run} className="mt-6 flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="OneLake shortcuts, Direct Lake fallback, capacity throttling…"
            className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/40"
          />
          <button
            disabled={busy}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#070b16] hover:bg-white/90 disabled:opacity-50"
          >
            {busy ? "…" : "Search"}
          </button>
        </form>

        {results && (
          <div className="mt-10 space-y-10">
            <Section title={`Topics (${results.topics.length})`}>
              {results.topics.map((t) => (
                <Link
                  key={t.slug}
                  to="/topics/$slug"
                  params={{ slug: t.slug }}
                  className="block rounded-md p-2 hover:bg-white/5"
                >
                  <div className="text-sm font-medium text-white">{t.name}</div>
                  <div className="text-xs text-white/55">{t.description}</div>
                </Link>
              ))}
            </Section>
            <Section title={`Articles (${results.blogs.length})`}>
              {results.blogs.map((b) => (
                <Link
                  key={b.slug}
                  to="/blog/$slug"
                  params={{ slug: b.slug }}
                  className="block rounded-md p-2 hover:bg-white/5"
                >
                  <div className="text-sm font-medium text-white">{b.title}</div>
                  <div className="text-xs text-white/55">{b.summary}</div>
                </Link>
              ))}
            </Section>
            <Section title={`Claims (${results.claims.length})`}>
              {results.claims.map((c: any) => (
                <div key={c.id} className="rounded-md p-2">
                  <div className="flex items-center gap-2">
                    <DepthBadge depth={c.depth} />
                    {c.sources?.tier && <TierBadge tier={c.sources.tier} />}
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      {c.capability_id}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-white/80">{c.text}</p>
                  {c.sources && (
                    <a
                      href={c.sources.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs text-teal-300 hover:underline"
                    >
                      {c.sources.title}
                    </a>
                  )}
                </div>
              ))}
            </Section>
            <Section title={`Sources (${results.sources.length})`}>
              {results.sources.map((s) => (
                <a
                  key={s.slug}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md p-2 hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{s.title}</span>
                    <TierBadge tier={s.tier} />
                  </div>
                  <div className="text-xs text-white/55">{s.summary}</div>
                </a>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">{title}</h2>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}
