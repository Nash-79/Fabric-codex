import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { FabricMark } from "./FabricMark";

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
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#070b16]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-white shrink-0"
        >
          <FabricMark className="h-6 w-6" />
          <span>Fabric Atlas</span>
          <span className="hidden text-xs font-normal text-white/40 lg:inline">
            for Microsoft Fabric
          </span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-2.5 py-1.5 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
              activeProps={{ className: "bg-white/10 text-white" }}
              activeOptions={{ exact: n.exact ?? false }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
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
                className="hidden text-xs text-white/65 hover:text-white md:inline"
              >
                Favorites
              </Link>
              {admin && (
                <Link
                  to="/settings"
                  className="hidden text-xs text-white/65 hover:text-white md:inline"
                >
                  Settings
                </Link>
              )}
              <button
                onClick={() => supabase.auth.signOut()}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
