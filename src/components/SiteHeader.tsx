import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { FabricMark } from "./FabricMark";
import { ThemeToggle } from "./ThemeToggle";

const NAV: ReadonlyArray<{ to: string; label: string; exact?: boolean }> = [
  { to: "/", label: "Overview", exact: true },
  { to: "/topics", label: "Topics" },
  { to: "/search", label: "Search" },
  { to: "/registry", label: "Registry" },
  { to: "/sources", label: "Sources" },
  { to: "/designs", label: "Designs" },
  { to: "/learn", label: "Learn" },
  { to: "/help", label: "Help" },
  { to: "/author", label: "Author" },
];

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    async function sync(session?: Session | null) {
      const isSignedIn = !!session;
      setSignedIn(isSignedIn);
      if (!isSignedIn) {
        setAdmin(false);
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        setAdmin(false);
        return;
      }
      const { data } = await supabase.rpc("has_role", { _user_id: user.user.id, _role: "admin" });
      setAdmin(!!data);
    }
    supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => sync(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-foreground shrink-0"
        >
          <FabricMark className="h-6 w-6" />
          <span>Fabric Atlas</span>
          <span className="hidden text-xs font-normal text-muted-foreground lg:inline">
            for Microsoft Fabric
          </span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to as "/"}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
              activeOptions={{ exact: n.exact ?? false }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            to="/advisor"
            className="hidden rounded-md border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-500/20 md:inline-block"
          >
            Advisor
          </Link>
          {signedIn ? (
            <>
              <Link
                to="/favorites"
                className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
              >
                Favorites
              </Link>
              {admin && (
                <Link
                  to="/settings"
                  className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
                >
                  Settings
                </Link>
              )}
              <button
                onClick={() => supabase.auth.signOut()}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
