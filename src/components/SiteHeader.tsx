import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FabricMark } from "./FabricMark";
import { ThemeToggle } from "./ThemeToggle";

// Navigation is organised by user intent, not as a flat list:
//  • Primary  — the two entry points most visits start from.
//  • Knowledge — the source-grounded knowledge base (what the atlas knows).
//  • Build     — the interactive tools that produce or query knowledge.
// Help/Favorites/Settings live in the right-hand utility cluster.
type NavLink = { to: string; label: string; hint?: string; exact?: boolean };

const PRIMARY: ReadonlyArray<NavLink> = [
  { to: "/", label: "Overview", exact: true },
  { to: "/topics", label: "Topics", hint: "Browse Fabric by topic" },
];

const KNOWLEDGE: ReadonlyArray<NavLink> = [
  { to: "/registry", label: "Capability Registry", hint: "The spine — coverage per capability" },
  { to: "/sources", label: "Sources", hint: "Graded, cited source library" },
  { to: "/learn", label: "Learn", hint: "Tiered lessons (Beginner→Expert)" },
  { to: "/designs", label: "Designs", hint: "Cited solution architectures" },
];

const BUILD: ReadonlyArray<NavLink> = [
  { to: "/advisor", label: "Advisor", hint: "Ask a source-grounded question" },
  { to: "/search", label: "Search", hint: "Search across the knowledge base" },
  { to: "/author", label: "Author", hint: "Compose & contribute content" },
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
    <header className="sticky top-0 z-30 border-b border-border bg-background/85">
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
          {PRIMARY.map((n) => (
            <NavItem key={n.to} link={n} />
          ))}
          <NavGroup label="Knowledge" links={KNOWLEDGE} />
          <NavGroup label="Build" links={BUILD} />
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            to="/advisor"
            className="hidden rounded-md border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-500/20 md:inline-block"
          >
            Advisor
          </Link>
          <Link
            to="/help"
            className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
          >
            Help
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
                type="button"
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

function NavItem({ link }: { link: NavLink }) {
  return (
    <Link
      to={link.to as "/"}
      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground" }}
      activeOptions={{ exact: link.exact ?? false }}
    >
      {link.label}
    </Link>
  );
}

function NavGroup({ label, links }: { label: string; links: ReadonlyArray<NavLink> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map((n) => (
          <DropdownMenuItem key={n.to} asChild>
            <Link to={n.to as "/"} className="flex cursor-pointer flex-col items-start gap-0.5">
              <span className="text-sm text-foreground">{n.label}</span>
              {n.hint && <span className="text-xs text-muted-foreground">{n.hint}</span>}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
