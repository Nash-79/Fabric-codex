import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  Trash2,
  RefreshCw,
  Zap,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Panel, Empty } from "@/components/settings/shared";
import {
  getApiKeysConfig,
  testAiProviderKey,
  saveApiKey,
  deleteApiKey,
  saveOpenRouterPolicy,
  RECOMMENDED_OPENROUTER_MODELS,
  DEFAULT_OPENROUTER_POLICY,
  type ApiKeyProviderConfig,
  type OpenRouterPolicy,
} from "@/lib/settings.functions";

type TestResult = {
  ok: boolean;
  message?: string;
  error?: string;
  latencyMs?: number;
  details?: {
    label?: string;
    usage?: string;
    usageWeekly?: string;
    limit?: number | null;
    isFreeTier?: boolean;
  };
};

export function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const getKeysFn = useServerFn(getApiKeysConfig);
  const testKeyFn = useServerFn(testAiProviderKey);
  const saveKeyFn = useServerFn(saveApiKey);
  const deleteKeyFn = useServerFn(deleteApiKey);
  const savePolicyFn = useServerFn(saveOpenRouterPolicy);

  const keysQuery = useQuery({
    queryKey: ["settings-api-keys"],
    queryFn: () => getKeysFn(),
    refetchOnWindowFocus: false,
  });

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [policyOverride, setPolicyOverride] = useState<OpenRouterPolicy | null>(null);

  const activePolicy: OpenRouterPolicy =
    policyOverride ?? keysQuery.data?.openrouterPolicy ?? DEFAULT_OPENROUTER_POLICY;

  const testMutation = useMutation({
    mutationFn: async ({
      provider,
      apiKey,
      keyName,
    }: {
      provider: ApiKeyProviderConfig["provider"];
      apiKey: string;
      keyName: string;
    }) => {
      const res = await testKeyFn({ data: { provider, apiKey } });
      return { keyName, result: res as TestResult };
    },
    onSuccess: ({ keyName, result }) => {
      setTestResults((prev) => ({ ...prev, [keyName]: result }));
      if (result.ok) {
        toast.success(result.message || "Connection validated successfully!");
      } else {
        toast.error(result.error || "Validation failed.");
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to test key.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: { key: string; value: string }) => saveKeyFn({ data }),
    onSuccess: (_, vars) => {
      toast.success("API key saved securely.");
      setInputValues((prev) => ({ ...prev, [vars.key]: "" }));
      queryClient.invalidateQueries({ queryKey: ["settings-api-keys"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save API key.");
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: (policy: OpenRouterPolicy) => savePolicyFn({ data: { policy } }),
    onSuccess: (res) => {
      toast.success("OpenRouter model & fallback policy saved.");
      setPolicyOverride(res.policy);
      queryClient.invalidateQueries({ queryKey: ["settings-api-keys"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save model policy.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteKeyFn({ data: { key } }),
    onSuccess: () => {
      toast.success("API key removed.");
      queryClient.invalidateQueries({ queryKey: ["settings-api-keys"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to remove API key.");
    },
  });

  const providers = keysQuery.data?.providers ?? [];

  return (
    <Panel
      title="AI Inference & API Keys"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-border bg-card text-foreground"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["settings-api-keys"] })}
          disabled={keysQuery.isFetching}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${keysQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-teal-500" />
            Governed AI Provider Routing
          </div>
          <p className="mt-1 leading-relaxed">
            API keys configure the live AI inference engine powering the{" "}
            <strong>Advisor Chat</strong>, automated article drafting, and claim extraction.
            Credentials saved here are stored in Supabase with Row-Level Security (RLS) and
            restricted strictly to administrators.
          </p>
        </div>

        {keysQuery.isLoading ? (
          <Empty text="Loading API keys configuration..." />
        ) : (
          <div className="grid gap-5">
            {providers.map((p) => {
              const currentInput = inputValues[p.key] ?? "";
              const isMaskedVisible = showKey[p.key] ?? false;
              const testResult = testResults[p.key];
              const isTesting = testMutation.isPending && testMutation.variables?.keyName === p.key;
              const isSaving = saveMutation.isPending && saveMutation.variables?.key === p.key;
              const isOpenRouter = p.provider === "openrouter";

              return (
                <div
                  key={p.key}
                  className={`rounded-lg border p-5 transition-colors ${
                    isOpenRouter
                      ? "border-teal-500/40 bg-teal-950/10 dark:bg-teal-950/20 shadow-sm"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <KeyRound
                          className={`h-4 w-4 ${isOpenRouter ? "text-teal-400" : "text-muted-foreground"}`}
                        />
                        <h3 className="font-semibold text-sm text-foreground">{p.label}</h3>
                        {isOpenRouter && (
                          <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px]">
                            Recommended
                          </Badge>
                        )}
                        {p.isConfigured ? (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                            {p.source === "db" ? "Configured (DB)" : "Active (.env)"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            Not Configured
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>

                    {isOpenRouter && (
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-500 dark:text-teal-400"
                      >
                        Get OpenRouter Key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {/* Masked display of currently stored key */}
                  {p.isConfigured && p.maskedValue && (
                    <div className="mt-3 flex items-center gap-2 rounded bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground">
                      <span className="text-foreground/80 font-medium">Active Key:</span>
                      <span>{p.maskedValue}</span>
                      {p.updatedAt && (
                        <span className="ml-auto text-[10px] text-muted-foreground/70">
                          Updated {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Input form */}
                  <div className="mt-4 space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={isMaskedVisible ? "text" : "password"}
                          placeholder={
                            p.isConfigured
                              ? "Enter a new key to update..."
                              : `Paste your ${p.label} key here...`
                          }
                          value={currentInput}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [p.key]: e.target.value }))
                          }
                          className="pr-10 text-xs font-mono border-border bg-background"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKey((prev) => ({ ...prev, [p.key]: !isMaskedVisible }))
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          title={isMaskedVisible ? "Hide key" : "Show key"}
                        >
                          {isMaskedVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!currentInput.trim() || isTesting}
                        onClick={() =>
                          testMutation.mutate({
                            provider: p.provider,
                            apiKey: currentInput.trim(),
                            keyName: p.key,
                          })
                        }
                        className="h-9 px-3 text-xs gap-1.5 shrink-0"
                      >
                        <Zap className={`h-3.5 w-3.5 ${isTesting ? "animate-spin" : ""}`} />
                        {isTesting ? "Testing..." : "Test Connection"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={!currentInput.trim() || isSaving}
                        onClick={() =>
                          saveMutation.mutate({
                            key: p.key,
                            value: currentInput.trim(),
                          })
                        }
                        className="h-9 px-3 text-xs gap-1.5 shrink-0 bg-teal-600 hover:bg-teal-500 text-white"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? "Saving..." : "Save Key"}
                      </Button>

                      {p.isConfigured && p.source === "db" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Remove custom ${p.label} key from database?`)) {
                              deleteMutation.mutate(p.key);
                            }
                          }}
                          className="h-9 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                          title="Remove custom key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Test result display */}
                    {testResult && (
                      <div
                        className={`rounded-md border p-3 text-xs transition-all ${
                          testResult.ok
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {testResult.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-400" />
                          )}
                          <span>
                            {testResult.ok
                              ? testResult.message
                              : `Validation Error: ${testResult.error}`}
                          </span>
                          {testResult.latencyMs && (
                            <span className="ml-auto text-[10px] text-muted-foreground opacity-80">
                              {testResult.latencyMs}ms
                            </span>
                          )}
                        </div>

                        {testResult.ok && testResult.details && (
                          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-emerald-500/20 pt-2 text-[11px] sm:grid-cols-4">
                            <div>
                              <span className="text-muted-foreground">Label: </span>
                              <span className="font-mono">{testResult.details.label}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Usage: </span>
                              <span className="font-mono">${testResult.details.usage}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Free Tier: </span>
                              <span>{testResult.details.isFreeTier ? "Yes" : "No (Funded)"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status: </span>
                              <span className="text-emerald-300">Ready for Live Inference</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* OpenRouter Model Routing & Cost Policy Controls */}
                    {isOpenRouter && (
                      <div className="mt-5 rounded-lg border border-teal-500/30 bg-background/80 p-4 space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4 text-teal-400" />
                              <h4 className="text-xs font-semibold text-foreground">
                                Model Routing & Cost Guardrails
                              </h4>
                              {activePolicy.free_tier_only ? (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] gap-1">
                                  <ShieldCheck className="h-3 w-3" /> Zero-Cost Active ($0 Spend)
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-amber-300 border-amber-500/30 bg-amber-500/10 text-[10px] gap-1"
                                >
                                  <ShieldAlert className="h-3 w-3" /> Pay-As-You-Go with Free Fallbacks
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Configure preferred models, free-tier enforcement, and automatic fallback chains to prevent cost runs.
                            </p>
                          </div>

                          <Button
                            size="sm"
                            disabled={savePolicyMutation.isPending}
                            onClick={() => savePolicyMutation.mutate(activePolicy)}
                            className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-500 text-white shrink-0 gap-1.5"
                          >
                            <Save className="h-3 w-3" />
                            {savePolicyMutation.isPending ? "Saving Policy..." : "Save Policy"}
                          </Button>
                        </div>

                        {/* Free Tier Enforcement Switch */}
                        <div className="flex items-center justify-between rounded-md border border-border/80 bg-muted/30 p-3">
                          <div className="space-y-0.5 pr-4">
                            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                              <ShieldCheck
                                className={`h-3.5 w-3.5 ${
                                  activePolicy.free_tier_only
                                    ? "text-emerald-400"
                                    : "text-muted-foreground"
                                }`}
                              />
                              Enforce Free Tier (Zero-Cost Guardrail)
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Strictly restricts all AI inferences exclusively to verified{" "}
                              <code className="text-teal-400">:free</code> OpenRouter models with a 100% $0 spend guarantee. Rejects any paid model invocation.
                            </p>
                          </div>
                          <Switch
                            checked={activePolicy.free_tier_only}
                            onCheckedChange={(checked) => {
                              const freeModels = RECOMMENDED_OPENROUTER_MODELS.filter(
                                (m) => m.isFree,
                              ).map((m) => m.id);
                              const newPrimary = checked
                                ? activePolicy.primary_model.endsWith(":free")
                                  ? activePolicy.primary_model
                                  : freeModels[0]
                                : activePolicy.primary_model;
                              const newFallbacks = checked
                                ? activePolicy.fallback_models.filter((m) => m.endsWith(":free"))
                                : activePolicy.fallback_models;
                              setPolicyOverride({
                                ...activePolicy,
                                free_tier_only: checked,
                                primary_model: newPrimary,
                                fallback_models:
                                  newFallbacks.length > 0 ? newFallbacks : freeModels.slice(1, 4),
                              });
                            }}
                          />
                        </div>

                        {/* Primary Model Selection */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground flex items-center justify-between">
                            <span>Primary Recommended Model</span>
                            <span className="text-[10px] text-muted-foreground">
                              {activePolicy.free_tier_only
                                ? "Filtered to verified Free Tier models"
                                : "All recommended models"}
                            </span>
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {RECOMMENDED_OPENROUTER_MODELS.filter(
                              (m) => !activePolicy.free_tier_only || m.isFree,
                            ).map((m) => {
                              const isSelected = activePolicy.primary_model === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() =>
                                    setPolicyOverride({
                                      ...activePolicy,
                                      primary_model: m.id,
                                    })
                                  }
                                  className={`flex flex-col text-left p-2.5 rounded-md border text-xs transition-all ${
                                    isSelected
                                      ? "border-teal-500 bg-teal-950/30 text-foreground ring-1 ring-teal-500/50"
                                      : "border-border/70 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground"
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full font-medium">
                                    <span
                                      className={
                                        isSelected ? "text-teal-300 font-semibold" : ""
                                      }
                                    >
                                      {m.label}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {m.isFree ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] px-1 py-0">
                                          Free
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-muted-foreground text-[9px] px-1 py-0"
                                        >
                                          Paid
                                        </Badge>
                                      )}
                                      {isSelected && (
                                        <Check className="h-3.5 w-3.5 text-teal-400 ml-1" />
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-1">
                                    {m.hint}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Fallback Models Selection */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-xs font-medium text-foreground flex items-center justify-between">
                            <span>Automatic Fallback Chain (on rate limits / HTTP 429)</span>
                            <span className="text-[10px] text-muted-foreground">
                              Select models to try in sequential order
                            </span>
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {RECOMMENDED_OPENROUTER_MODELS.filter(
                              (m) => !activePolicy.free_tier_only || m.isFree,
                            ).map((m) => {
                              const index = activePolicy.fallback_models.indexOf(m.id);
                              const isFallback = index !== -1;
                              const isPrimary = activePolicy.primary_model === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  disabled={isPrimary}
                                  onClick={() => {
                                    let updated = [...activePolicy.fallback_models];
                                    if (isFallback) {
                                      updated = updated.filter((id) => id !== m.id);
                                    } else {
                                      updated.push(m.id);
                                    }
                                    setPolicyOverride({
                                      ...activePolicy,
                                      fallback_models: updated,
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border transition-all ${
                                    isPrimary
                                      ? "border-dashed border-border opacity-40 cursor-not-allowed text-muted-foreground"
                                      : isFallback
                                        ? "border-teal-500/60 bg-teal-500/20 text-teal-200 font-medium"
                                        : "border-border/70 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground"
                                  }`}
                                >
                                  {isFallback && (
                                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-slate-950">
                                      {index + 1}
                                    </span>
                                  )}
                                  <span>{m.label}</span>
                                  {m.isFree && (
                                    <span className="text-[9px] text-emerald-400 font-mono">
                                      :free
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
