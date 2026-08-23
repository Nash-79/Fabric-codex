import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, Search, X } from "lucide-react";
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
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { FabricMark } from "./FabricMark";
import { ThemeToggle } from "./ThemeToggle";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

type NavLink = { to: string; label: string; hint?: string; exact?: boolean };

const PRIMARY: ReadonlyArray<NavLink> = [
  { to: "/", label: "Home", exact: true },
  { to: "/topics", label: "Topics", hint: "Browse Fabric by topic" },
];

const KNOWLEDGE: ReadonlyArray<NavLink> = [
  { to: "/registry", label: "Capability Registry", hint: "The spine — coverage per capability" },
  { to: "/sources", label: "Sources", hint: "Graded, cited source library" },
  { to: "/learn", label: "Learn", hint: "Tiered lessons (Beginner→Expert)" },
  { to: "/blogs", label: "Blogs", hint: "Cited articles, architectures, and lessons" },
  { to: "/roadmap", label: "Roadmap", hint: "What's coming to Microsoft Fabric" },
];

// Advisor lives in the right-cluster CTA button (and the mobile sheet) — not duplicated here.
const BUILD: ReadonlyArray<NavLink> = [
  { to: "/search", label: "Search", hint: "Search across the knowledge base" },
  { to: "/author", label: "Author", hint: "How authoring works" },
];

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { direction, atTop } = useScrollDirection();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the mobile sheet whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  const hidden = direction === "down" && !atTop && !mobileOpen;

  return (
    <header
      className={`sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70 transition-transform duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <FabricMark className="h-6 w-6 shrink-0" />
          <span className="truncate">Fabric Atlas</span>
          <span className="hidden text-xs font-normal text-muted-foreground xl:inline">
            for Microsoft Fabric
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
          {PRIMARY.map((n) => (
            <NavItem key={n.to} link={n} />
          ))}
          <NavGroup label="Knowledge" links={KNOWLEDGE} />
          <NavGroup label="Build" links={BUILD} />
        </nav>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
            }
            className="hidden items-center gap-1.5 rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition md:flex"
            title="Quick search (⌘K or Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="pointer-events-none hidden h-4 select-none items-center gap-0.5 rounded border border-border bg-background px-1 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />
          <Link
            to="/advisor"
            className="hidden rounded-md border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/20 md:inline-block"
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
                className="hidden rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent md:inline-block"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="hidden rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent md:inline-block"
            >
              Sign in
            </Link>
          )}

          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[86vw] max-w-sm overflow-y-auto p-0 [&>button.absolute]:hidden"
            >
              <SheetTitle className="sr-only">Fabric Atlas navigation</SheetTitle>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FabricMark className="h-5 w-5" />
                  Fabric Atlas
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-2 py-3">
                <MobileSection links={PRIMARY} />
                <MobileSection
                  links={[
                    { to: "/advisor", label: "Advisor", hint: "Ask a source-grounded question" },
                  ]}
                />
                <MobileGroup label="Knowledge" links={KNOWLEDGE} />
                <MobileGroup label="Build" links={BUILD} />
                <div className="mt-4 border-t border-border pt-3 space-y-1 px-2">
                  <MobileLink to="/help" label="Help" />
                  {signedIn && <MobileLink to="/favorites" label="Favorites" />}
                  {signedIn && admin && <MobileLink to="/settings" label="Settings" />}
                  {signedIn ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        supabase.auth.signOut();
                      }}
                      className="mt-1 w-full rounded-md border border-border px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Sign out
                    </button>
                  ) : (
                    <Link
                      to="/auth"
                      className="mt-1 block rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Sign in
                    </Link>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function NavItem({ link }: { link: NavLink }) {
  return (
    <Link
      to={link.to as "/"}
      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
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

function MobileSection({ links }: { links: ReadonlyArray<NavLink> }) {
  return (
    <div className="space-y-1 px-2">
      {links.map((n) => (
        <MobileLink key={n.to} to={n.to} label={n.label} hint={n.hint} exact={n.exact} />
      ))}
    </div>
  );
}

function MobileGroup({ label, links }: { label: string; links: ReadonlyArray<NavLink> }) {
  return (
    <div className="mt-4">
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-1 px-2">
        {links.map((n) => (
          <MobileLink key={n.to} to={n.to} label={n.label} hint={n.hint} />
        ))}
      </div>
    </div>
  );
}

function MobileLink({
  to,
  label,
  hint,
  exact,
}: {
  to: string;
  label: string;
  hint?: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to as "/"}
      activeOptions={{ exact: exact ?? false }}
      activeProps={{ className: "bg-accent text-foreground" }}
      className="flex min-h-11 flex-col justify-center rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-accent"
    >
      <span className="font-medium">{label}</span>
      {hint && <span className="mt-0.5 text-xs text-muted-foreground">{hint}</span>}
    </Link>
  );
}
