import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Pin, PinOff } from "lucide-react";

export type TopicTreeRow = {
  slug: string;
  parent_slug: string | null;
  name: string;
  sort_order?: number;
};

type TreeNode = TopicTreeRow & { children: TreeNode[] };

function buildTree(topics: TopicTreeRow[]): TreeNode[] {
  const bySlug = new Map<string, TreeNode>(topics.map((t) => [t.slug, { ...t, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of bySlug.values()) {
    if (node.parent_slug && bySlug.has(node.parent_slug)) {
      bySlug.get(node.parent_slug)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const bySort = (a: TreeNode, b: TreeNode) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort(bySort);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function ancestorChain(topics: TopicTreeRow[], slug: string | undefined): Set<string> {
  const chain = new Set<string>();
  if (!slug) return chain;
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  let current = bySlug.get(slug);
  while (current) {
    chain.add(current.slug);
    current = current.parent_slug ? bySlug.get(current.parent_slug) : undefined;
  }
  return chain;
}

// Left-nav topic tree — collapsible hover/pin rail. Collapsed by default (narrow icon rail),
// expands on hover, and can be pinned open via the toggle so it stays open alongside the
// in-page TOC. Used on /topics and the unified /blogs/$kind/$slug detail route. Previously
// there was no tree component at all — topic browsing was a flat grid with a text breadcrumb.
export function TopicTree({ topics, activeSlug }: { topics: TopicTreeRow[]; activeSlug?: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const tree = useMemo(() => buildTree(topics), [topics]);
  const openAncestors = useMemo(() => ancestorChain(topics, activeSlug), [topics, activeSlug]);
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(openAncestors);

  useEffect(() => {
    setOpenSlugs((prev) => new Set([...prev, ...openAncestors]));
  }, [openAncestors]);

  const expanded = pinned || hovering;

  return (
    <div
      className={`sticky top-20 shrink-0 rounded-md border border-border bg-card transition-[width] duration-150 ${
        expanded ? "w-64" : "w-11"
      }`}
      onMouseEnter={() => !pinned && setHovering(true)}
      onMouseLeave={() => !pinned && setHovering(false)}
    >
      <div className="flex items-center justify-between border-b border-border px-2 py-2">
        {expanded && (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Topics
          </span>
        )}
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={pinned ? "Unpin topic tree" : "Pin topic tree open"}
          title={pinned ? "Unpin" : "Pin open"}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-1.5">
        {tree.map((node) => (
          <TreeItem
            key={node.slug}
            node={node}
            depth={0}
            expanded={expanded}
            activeSlug={activeSlug}
            openSlugs={openSlugs}
            onToggle={(slug) =>
              setOpenSlugs((prev) => {
                const next = new Set(prev);
                if (next.has(slug)) next.delete(slug);
                else next.add(slug);
                return next;
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function TreeItem({
  node,
  depth,
  expanded,
  activeSlug,
  openSlugs,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  activeSlug?: string;
  openSlugs: Set<string>;
  onToggle: (slug: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = openSlugs.has(node.slug);
  const isActive = node.slug === activeSlug;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs ${
          isActive
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        style={{ paddingLeft: expanded ? 6 + depth * 12 : 6 }}
      >
        {hasChildren && expanded ? (
          <button
            type="button"
            onClick={() => onToggle(node.slug)}
            className="shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Link
          to="/topics/$slug"
          params={{ slug: node.slug }}
          className={`min-w-0 flex-1 truncate ${expanded ? "" : "sr-only"}`}
          title={node.name}
        >
          {node.name}
        </Link>
        {!expanded && (
          <Link
            to="/topics/$slug"
            params={{ slug: node.slug }}
            className="absolute inset-0"
            aria-label={node.name}
          />
        )}
      </div>
      {hasChildren && expanded && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.slug}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activeSlug={activeSlug}
              openSlugs={openSlugs}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
