import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FabricMark } from "@/components/FabricMark";

// The @supabase/supabase-js `auth.oauth` namespace is beta and not always in
// the shipped types. Wrap only the three methods we need.
type OAuthClient = { name?: string | null; redirect_uri?: string | null };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  scopes?: string[] | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type AuthOAuth = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
const authOAuth = (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOAuth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-10 text-foreground">
      <h1 className="text-xl font-semibold">Authorization unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await authOAuth.approveAuthorization(authorization_id)
      : await authOAuth.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold">
          <FabricMark className="h-6 w-6" /> Fabric Atlas
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Connect {clientName} to Fabric Atlas
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} call Fabric Atlas MCP tools while you are signed in. It does not
          bypass this app's row-level policies.
        </p>
        {scopes.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {scopes.map((s: string) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button
            onClick={() => decide(true)}
            disabled={busy}
            className="flex-1 bg-gradient-to-r from-teal-400 to-sky-500 text-slate-950 hover:opacity-90"
          >
            {busy ? "Working…" : "Approve"}
          </Button>
          <Button
            onClick={() => decide(false)}
            disabled={busy}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </main>
  );
}
