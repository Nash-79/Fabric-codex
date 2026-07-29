import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Database, Milestone, Pause, Play } from "lucide-react";

type FeedItem = {
  key: string;
  kind: "article" | "source" | "roadmap";
  title: string;
  href: string;
  external?: boolean;
  when?: string | null;
};

function relative(when: string | null | undefined): string {
  if (!when) return "";
  const then = new Date(when).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d < 1) return "today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

const kindMeta = {
  article: { label: "Article", icon: BookOpen, cls: "text-teal-300 border-teal-500/30 bg-teal-500/10" },
  source: { label: "Source", icon: Database, cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  roadmap: { label: "Roadmap", icon: Milestone, cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
} as const;

export function UpdatesMarquee({
  articles,
  sources,
  roadmap,
}: {
  articles: Array<{ slug: string; kind?: string; title: string; updated_at?: string; created_at?: string }>;
  sources: Array<{ slug: string; title: string; created_at?: string }>;
  roadmap: Array<{ id?: string; guid?: string; title: string; link?: string; pub_date?: string | null }>;
}) {
  const items = useMemo<FeedItem[]>(() => {
    const a: FeedItem[] = articles.slice(0, 8).map((i) => ({
      key: `a-${i.slug}`,
      kind: "article",
      title: i.title,
      href: `/blogs/${i.kind ?? "article"}/${i.slug}`,
      when: i.updated_at ?? i.created_at ?? null,
    }));
    const s: FeedItem[] = sources.slice(0, 6).map((i) => ({
      key: `s-${i.slug}`,
      kind: "source",
      title: i.title,
      href: `/sources`,
      when: i.created_at ?? null,
    }));
    const r: FeedItem[] = roadmap.slice(0, 6).map((i) => ({
      key: `r-${i.id ?? i.guid ?? i.title}`,
      kind: "roadmap",
      title: i.title,
      href: i.link || "/roadmap",
      external: !!i.link,
      when: i.pub_date ?? null,
    }));
    return [...a, ...s, ...r]
      .sort((x, y) => new Date(y.when ?? 0).getTime() - new Date(x.when ?? 0).getTime())
      .slice(0, 18);
  }, [articles, sources, roadmap]);

  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Don't burn a CSS animation frame budget while the marquee is scrolled off-screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "50px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (items.length === 0) return null;
  const shouldAnimate = !reduced && !paused && inView;

  return (
    <section
      ref={sectionRef}
      className="border-b border-border bg-card/60 backdrop-blur-sm"
      aria-label="Latest updates"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300/80">
          Latest
        </span>
        <div
          className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div
            ref={trackRef}
            className="flex w-max gap-6 py-1"
            style={{
              animation: shouldAnimate ? "fa-marquee 60s linear infinite" : "none",
            }}
          >
            {[...items, ...items].map((item, idx) => {
              const meta = kindMeta[item.kind];
              const Icon = meta.icon;
              const content = (
                <span className="inline-flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="text-foreground/90 group-hover:text-foreground">{item.title}</span>
                  {item.when && (
                    <span className="text-[11px] text-muted-foreground">· {relative(item.when)}</span>
                  )}
                </span>
              );
              return item.external ? (
                <a
                  key={`${item.key}-${idx}`}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group shrink-0 hover:underline"
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={`${item.key}-${idx}`}
                  to={item.href as any}
                  className="group shrink-0 hover:underline"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={paused ? "Resume marquee" : "Pause marquee"}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>
    </section>
  );
}
