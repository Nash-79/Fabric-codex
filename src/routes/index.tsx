import { createFileRoute, Link } from "@tanstack/react-router";
import { FabricMark } from "@/components/FabricMark";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fabric Atlas — Governed knowledge, grounded architecture" },
      {
        name: "description",
        content:
          "A governed, source-grounded knowledge and architecture platform for Microsoft Fabric. Cited claims, tiered learning, and a grounded Advisor.",
      },
      { property: "og:title", content: "Fabric Atlas" },
      {
        property: "og:description",
        content: "Governed knowledge → grounded architecture for Microsoft Fabric.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, rgba(45,212,191,0.18), transparent 70%), radial-gradient(40% 40% at 80% 30%, rgba(99,102,241,0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-24 md:pt-32">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
            <FabricMark className="h-4 w-4" />
            Fabric Atlas
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
            Governed knowledge → <span className="text-teal-300">grounded architecture</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
            Fabric Atlas turns approved Microsoft Fabric sources into versioned, tier‑graded{" "}
            <em>claims</em> tagged to capabilities and depth levels. Browse the atlas, read cited
            topic articles, and ask the Advisor — every answer is grounded in the knowledge base.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/topics"
              className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#070b16] hover:bg-white/90"
            >
              Browse topics
            </Link>
            <Link
              to="/topics"
              className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium hover:bg-white/10"
            >
              Open the atlas
            </Link>
            <Link
              to="/advisor"
              className="rounded-md border border-teal-400/30 bg-teal-500/10 px-4 py-2.5 text-sm font-medium text-teal-200 hover:bg-teal-500/15"
            >
              Ask the Advisor
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          {
            t: "Cited claims",
            d: "Every fact ties back to an approved source with a 1–6 trust tier and an L1–L5 depth level.",
          },
          {
            t: "Capability spine",
            d: "OneLake, Direct Lake, Polaris, Real‑Time, Power BI — capabilities organise everything you read.",
          },
          {
            t: "Grounded Advisor",
            d: "Ask in natural language. Answers retrieve from the KB and refuse where the atlas is silent.",
          },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="text-sm font-semibold text-white">{c.t}</div>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{c.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
