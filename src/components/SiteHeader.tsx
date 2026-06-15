import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FabricMark } from "./FabricMark";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0f1e]/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <FabricMark className="h-7 w-7" />
          <span>Fabric Atlas</span>
          <span className="ml-2 hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60 sm:inline">
            for Microsoft Fabric
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/atlas" className="rounded-md px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white" activeProps={{ className: "rounded-md px-3 py-1.5 bg-white/5 text-white" }}>
            Atlas
          </Link>
          {email ? (
            <>
              <Link to="/favorites" className="rounded-md px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white" activeProps={{ className: "rounded-md px-3 py-1.5 bg-white/5 text-white" }}>
                Favorites
              </Link>
              <span className="ml-2 hidden text-xs text-white/40 md:inline">{email}</span>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-white/70 hover:bg-white/10 hover:text-white">
                Sign out
              </Button>
            </>
          ) : (
            <Link to="/auth" className="ml-1">
              <Button size="sm" className="bg-gradient-to-r from-teal-400 to-blue-500 text-slate-950 hover:opacity-90">
                Sign in
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
