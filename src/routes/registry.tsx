import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { listCapabilities } from "@/lib/atlas.functions";

export const Route = createFileRoute("/registry")({
  head: () => ({
    meta: [
      { title: "Capability Registry — Fabric Atlas" },
      {
        name: "description",
        content:
          "The capability registry is the spine of the Fabric Atlas. Browse every tracked Microsoft Fabric capability and its claim coverage.",
      },
      { property: "og:title", content: "Capability Registry — Fabric Atlas" },
      {
        property: "og:description",
        content: "Every tracked Microsoft Fabric capability and its claim coverage.",
      },
    ],
  }),
  component: RegistryPage,
});

function RegistryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["capabilities-registry"],
    queryFn: () => listCapabilities(),
  });

  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-[#070b16] dark:text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Spine
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Capability Registry</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Every claim, lesson, and design in the atlas is tagged to a capability. The registry is
          the architectural spine.
        </p>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-white/40">
                    Loading…
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-rose-300">
                    {(error as Error).message}
                  </td>
                </tr>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-white/40">
                    No capabilities yet.
                  </td>
                </tr>
              )}
              {(data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-white/65">{c.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
