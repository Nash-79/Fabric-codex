import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FabricMark } from "./FabricMark";

const NAV = [
  { to: "/topics", label: "Topics" },
  { to: "/atlas", label: "Atlas" },
  { to: "/sources", label: "Sources" },
  { to: "/advisor", label: "Advisor" },
  { to: "/search", label: "Search" },
  { to: "/help", label: "Help" },
] as const;

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#070b16]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <FabricMark className="h-6 w-6" />
          <span>Fabric Atlas</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-3 py-1.5 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
              activeProps={{ className: "bg-white/10 text-white" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <Link to="/favorites" className="text-xs text-white/65 hover:text-white">Favorites</Link>
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
