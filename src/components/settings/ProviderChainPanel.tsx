import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/settings/shared";
import { refreshModelCatalogue, saveProviderChain } from "@/lib/settings.functions";

type CatalogueModel = {
  id: string;
  provider: "openrouter" | "workers-ai";
  label: string;
  prompt_usd_per_m: number;
  completion_usd_per_m: number;
  context_length: number;
  supports_tools: boolean;
};
type Catalogue = { models: CatalogueModel[]; fetched_at: string; errors: Record<string, string> };
type ChainEntry = { provider: "workers-ai" | "openrouter" | "lovable"; model_id: string };

const entryKey = (e: { provider: string; model_id: string }) => e.provider + ":" + e.model_id;
const modelKey = (m: CatalogueModel) => m.provider + ":" + m.id;
const isFree = (m: CatalogueModel) => m.prompt_usd_per_m === 0 && m.completion_usd_per_m === 0;
const priceLabel = (m: CatalogueModel) =>
  isFree(m) ? "Free" : "$" + m.completion_usd_per_m.toFixed(2) + "/M out";

/**
 * Admin-ordered AI provider chain.
 *
 * Every model listed here comes from a LIVE catalogue fetch, never a compiled-in list. That is
 * the point: OpenRouter's free tier rotates, and the ids this app previously hardcoded had all
 * been withdrawn by the time anyone noticed, because nothing surfaced it until a request failed.
 * Choosing from what exists at deploy time is what keeps the chain correct.
 */
export function ProviderChainPanel() {
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshModelCatalogue);
  const saveFn = useServerFn(saveProviderChain);

  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [allowPaid, setAllowPaid] = useState(false);

  const catalogueQuery = useQuery({
    queryKey: ["model-catalogue"],
    queryFn: () => refreshFn({ data: {} }),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const catalogue = (catalogueQuery.data?.catalogue ?? null) as Catalogue | null;

  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { force: true } }),
    onSuccess: (res) => {
      qc.setQueryData(["model-catalogue"], res);
      const cat = res.catalogue as Catalogue | undefined;
      const errs = Object.keys(cat?.errors ?? {});
      if (errs.length) {
        toast.warning("Catalogue partially refreshed - " + errs.join(", ") + " failed.");
      } else {
        toast.success((cat?.models?.length ?? 0) + " models available.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Could not reach the model providers."),
  });

  const paidIds = useMemo(
    () => (catalogue?.models ?? []).filter((m) => !isFree(m)).map(modelKey),
    [catalogue],
  );

  const save = useMutation({
    mutationFn: () =>
      saveFn({ data: { policy: { chain, allow_paid: allowPaid }, paidModelIds: paidIds } }),
    onSuccess: (res) => {
      if (res.droppedPaid?.length) {
        toast.warning("Saved. Paid entries dropped: " + res.droppedPaid.join(", "));
      } else {
        toast.success("Provider chain saved.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the chain."),
  });

  // Free always listed; paid only behind the opt-in, cheapest first so the floor is obvious.
  const selectable = useMemo(() => {
    const all = catalogue?.models ?? [];
    const visible = allowPaid ? all : all.filter(isFree);
    const chosen = new Set(chain.map(entryKey));
    return [...visible]
      .filter((m) => !chosen.has(modelKey(m)))
      .sort((a, b) => a.completion_usd_per_m - b.completion_usd_per_m || a.id.localeCompare(b.id));
  }, [catalogue, allowPaid, chain]);

  // A configured entry the catalogue no longer lists. Flagging it here catches a withdrawn model
  // before a request fails, rather than after.
  const unavailable = useMemo(() => {
    if (!catalogue?.models.length) return new Set<string>();
    const known = new Set(catalogue.models.map(modelKey));
    return new Set(chain.filter((e) => !known.has(entryKey(e))).map(entryKey));
  }, [catalogue, chain]);

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j], next[i]];
    setChain(next);
  };

  return (
    <Panel
      title="AI provider chain"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw className={"mr-2 h-4 w-4 " + (refresh.isPending ? "animate-spin" : "")} />
          Refresh models
        </Button>
      }
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Tried in the order you set. The first that answers serves the request; the rest are
          failover. Models are listed live from each provider, so a withdrawn one cannot linger
          unnoticed.
        </p>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Include paid models</p>
            <p className="text-xs text-muted-foreground">
              Off by default. Paid entries are listed cheapest-first and can never enter the chain
              while this is off.
            </p>
          </div>
          <Switch checked={allowPaid} onCheckedChange={setAllowPaid} />
        </div>

        {catalogue && Object.keys(catalogue.errors).length > 0 && (
          <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5" />
            Partial catalogue -{" "}
            {Object.entries(catalogue.errors)
              .map(([k, v]) => k + ": " + v)
              .join("; ")}
          </p>
        )}

        <div>
          <h4 className="text-sm font-medium">Chain order</h4>
          {chain.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing configured yet - add a model below.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {chain.map((entry, i) => (
                <li
                  key={entryKey(entry)}
                  className="flex items-center gap-2 rounded-lg border border-border p-2"
                >
                  <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <Badge variant="outline">{entry.provider}</Badge>
                  <span className="flex-1 truncate font-mono text-xs">{entry.model_id}</span>
                  {unavailable.has(entryKey(entry)) && (
                    <Badge variant="destructive" className="gap-1">
                      <TriangleAlert className="h-3 w-3" /> unavailable
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === chain.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setChain(chain.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium">
            Available now{" "}
            <span className="font-normal text-muted-foreground">({selectable.length})</span>
          </h4>
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
            {selectable.map((m) => (
              <div
                key={modelKey(m)}
                className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs"
              >
                <Badge variant="outline">{m.provider}</Badge>
                <span className="flex-1 truncate font-mono">{m.id}</span>
                {m.supports_tools && <Badge variant="secondary">tools</Badge>}
                <Badge variant={isFree(m) ? "secondary" : "outline"}>{priceLabel(m)}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setChain([...chain, { provider: m.provider, model_id: m.id }])}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save chain
          </Button>
        </div>
      </div>
    </Panel>
  );
}
