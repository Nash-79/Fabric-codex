import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listHelp } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";

const helpQO = queryOptions({ queryKey: ["help"], queryFn: () => listHelp() });

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Fabric Atlas" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQO),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-foreground">Not found.</div>,
  component: HelpPage,
});

function HelpPage() {
  const { data: docs } = useSuspenseQuery(helpQO);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Help</h1>
        {docs.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Help content has not been bootstrapped yet.
          </p>
        )}
        <div className="mt-8 space-y-12">
          {docs.map((d) => (
            <article key={d.slug} className="prose prose-invert max-w-none prose-a:text-teal-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.body_md}</ReactMarkdown>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
