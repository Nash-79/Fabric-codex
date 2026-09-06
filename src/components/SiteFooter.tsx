import { Link } from "@tanstack/react-router";
import { FabricMark } from "@/components/FabricMark";

/**
 * Site footer. There was none anywhere in the app, so every page simply stopped.
 *
 * Kept to genuinely useful destinations rather than a link farm. The sourcing note is not
 * decoration: this is a source-grounded platform, and saying so at the foot of every page is
 * part of the contract with the reader.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <FabricMark className="h-5 w-5" />
              <span className="text-sm font-semibold">Fabric Atlas</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              A source-grounded knowledge base for Microsoft Fabric. Every factual claim cites an
              approved source and is graded by trust tier — nothing here is generated without one.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3" aria-label="Footer">
            <FooterGroup title="Explore">
              <FooterLink to="/knowledge">Knowledge Hub</FooterLink>
              <FooterLink to="/topics">Topics</FooterLink>
              <FooterLink to="/registry">Capability Registry</FooterLink>
            </FooterGroup>
            <FooterGroup title="Reference">
              <FooterLink to="/sources">Sources</FooterLink>
              <FooterLink to="/docs">Reference Docs</FooterLink>
              <FooterLink to="/roadmap">Roadmap</FooterLink>
            </FooterGroup>
            <FooterGroup title="Use">
              <FooterLink to="/advisor">Advisor</FooterLink>
              <FooterLink to="/search">Search</FooterLink>
              <FooterLink to="/help">Help</FooterLink>
            </FooterGroup>
          </nav>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          Not affiliated with Microsoft. Product names and any official icons belong to their
          respective owners; diagrams here are original work.
        </p>
      </div>
    </footer>
  );
}

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-xs text-muted-foreground transition hover:text-foreground hover:underline"
      >
        {children}
      </Link>
    </li>
  );
}
