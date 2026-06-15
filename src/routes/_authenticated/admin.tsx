import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { amIAdmin, adminStats } from "@/lib/atlas.functions";
import { seedFromContent } from "@/lib/seed.functions";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Fabric Atlas" }] }),
  component: AdminPage,
});

function AdminPage() {
  const meFn = useServerFn(amIAdmin);
  const statsFn = useServerFn(adminStats);
  const seedFn = useServerFn(seedFromContent);
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => statsFn(), enabled: !!me.data?.admin });
  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Admin</h1>
        {me.isLoading && <p className="mt-4 text-white/55">Checking access…</p>}
        {me.data && !me.data.admin && (
          <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            You are not an admin. The first user to sign up is bootstrapped as admin automatically.
          </p>
        )}
        {me.data?.admin && (
          <>
            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-lg font-semibold">Seed content</h2>
              <p className="mt-1 text-sm text-white/55">
                Imports topics, sources, claims, blogs, diagrams, and help docs from the bundled <code>content/</code> JSON files.
                Re-runnable; existing rows are replaced.
              </p>
              <button
                onClick={() => seed.mutate()}
                disabled={seed.isPending}
                className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#070b16] hover:bg-white/90 disabled:opacity-50"
              >
                {seed.isPending ? "Seeding…" : "Seed from /content"}
              </button>
              {seed.data && (
                <pre className="mt-4 overflow-auto rounded-md bg-black/30 p-3 text-xs text-emerald-300">
{JSON.stringify(seed.data, null, 2)}
                </pre>
              )}
              {seed.error && (
                <p className="mt-3 text-sm text-rose-300">{(seed.error as Error).message}</p>
              )}
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-lg font-semibold">Stats</h2>
              {stats.data ? (
                <ul className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                  {Object.entries(stats.data).map(([k, v]) => (
                    <li key={k} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-white/45">{k}</div>
                      <div className="text-lg font-semibold text-white">{v as number}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-white/55">Loading…</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
