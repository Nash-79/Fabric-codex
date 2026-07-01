import { CAPABILITY_NAMES } from "./capability-names";

const topicsJson = import.meta.glob("/content/topics.json", { eager: true }) as Record<
  string,
  { default: any[] }
>;
const sourceJsons = import.meta.glob("/content/sources/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const blogJsons = import.meta.glob("/content/articles/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const designJsons = import.meta.glob("/content/designs/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const diagramAssets = import.meta.glob("/content/diagrams/assets.json", { eager: true }) as Record<
  string,
  { default: any[] }
>;
const helpMd = import.meta.glob("/content/help/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function fileStem(path: string) {
  return path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
}

function slugify(value: string) {
  const slug = (value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 80) || "source";
}

function sourceRows() {
  return Object.entries(sourceJsons).map(([path, mod]) => {
    const source = mod.default;
    const slug = slugify(source.url || source.title || fileStem(path));
    return {
      id: slug,
      slug,
      source_key: slug,
      url: source.url ?? "",
      title: source.title ?? slug,
      tier: source.tier ?? 6,
      tags: source.tags ?? [],
      summary: source.summary ?? "",
      active: true,
      claims: source.claims ?? [],
    };
  });
}

function topicRows() {
  const rows = Object.values(topicsJson)[0]?.default ?? [];
  return rows
    .map((topic) => ({
      slug: topic.slug,
      parent_slug: topic.parent_slug ?? null,
      name: topic.name ?? topic.slug,
      description: topic.description ?? "",
      sort_order: topic.order ?? topic.sort_order ?? 0,
      capability_ids: topic.capability_ids ?? [],
      tags: topic.tags ?? [],
      active: true,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function capabilityRows() {
  const ids = new Set<string>();
  for (const topic of topicRows()) {
    for (const id of topic.capability_ids ?? []) ids.add(id);
  }
  for (const source of sourceRows()) {
    for (const claim of source.claims ?? []) {
      if (claim.capability_id) ids.add(claim.capability_id);
    }
  }
  return [...ids].sort().map((id) => ({
    id,
    name: CAPABILITY_NAMES[id]?.name ?? id,
    description: CAPABILITY_NAMES[id]?.description ?? "",
    accent: CAPABILITY_NAMES[id]?.accent ?? "teal",
    maturity: "ga" as const,
    released_at: null,
  }));
}

function blogRows() {
  return Object.entries(blogJsons)
    .map(([path, mod]) => {
      const blog = mod.default;
      return {
        id: blog.slug ?? fileStem(path),
        slug: blog.slug ?? fileStem(path),
        topic_slug: blog.topic_slug ?? null,
        title: blog.title ?? blog.slug ?? fileStem(path),
        summary: blog.summary ?? "",
        body_md: blog.body_md ?? "",
        status: "published",
        tags: blog.tags ?? [],
        depth_levels: blog.depth_levels ?? [],
        cited_source_keys: blog.cited_source_keys ?? [],
        updated_at: "",
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function designRows() {
  return Object.entries(designJsons).map(([path, mod]) => {
    const design = mod.default;
    return {
      id: design.slug ?? fileStem(path),
      slug: design.slug ?? fileStem(path),
      title: design.title ?? design.slug ?? fileStem(path),
      summary: design.summary ?? "",
      scenario: design.scenario ?? "",
      body_md: design.body_md ?? "",
      output_md: design.body_md ?? "",
      status: "published",
      tags: design.tags ?? [],
      cited_source_keys: design.cited_source_keys ?? [],
      updated_at: "",
    };
  });
}

function diagramRows() {
  return (Object.values(diagramAssets)[0]?.default ?? []).map((diagram) => {
    const slug = fileStem(diagram.path ?? "");
    return {
      slug,
      path: `/diagrams/${slug}.svg`,
      caption: diagram.caption ?? "",
      kind: diagram.kind ?? "generated",
      capability_id: diagram.capability_id ?? "",
    };
  });
}

function citations(keys: string[]) {
  const sources = new Map(sourcesMemo().map((source) => [source.source_key, source]));
  return keys.map((key, i) => ({
    label: `S${i + 1}`,
    source: sources.get(key) ?? {
      id: key,
      slug: key,
      source_key: key,
      url: "",
      title: key,
      tier: 6,
      tags: [],
      summary: "",
    },
  }));
}

function helpRows() {
  return Object.entries(helpMd)
    .map(([path, body]) => {
      const stem = fileStem(path);
      const match = stem.match(/^(\d+)-(.+)$/);
      const sort_order = match ? Number.parseInt(match[1], 10) : 0;
      const slug = match ? match[2] : stem;
      const title = body
        .split("\n")
        .find((line) => line.startsWith("#"))
        ?.replace(/^#+\s*/, "");
      return { slug, title: title ?? slug, body_md: body, sort_order };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

let memoTopics: ReturnType<typeof topicRows> | undefined;
let memoSources: ReturnType<typeof sourceRows> | undefined;
let memoCapabilities: ReturnType<typeof capabilityRows> | undefined;
let memoBlogs: ReturnType<typeof blogRows> | undefined;
let memoDesigns: ReturnType<typeof designRows> | undefined;
let memoDiagrams: ReturnType<typeof diagramRows> | undefined;
let memoHelp: ReturnType<typeof helpRows> | undefined;
let memoClaims: ReturnType<typeof claimsRows> | undefined;

function claimsRows() {
  return sourcesMemo().flatMap((source) =>
    (source.claims ?? []).map((claim: any, index: number) => ({
      id: `${source.slug}-${index}`,
      text: claim.text ?? "",
      depth: claim.depth ?? 2,
      type: claim.type ?? "fact",
      tags: claim.tags ?? [],
      capability_id: claim.capability_id ?? "",
      active: true,
      sources: {
        slug: source.slug,
        url: source.url,
        title: source.title,
        tier: source.tier,
      },
    })),
  );
}

function topicsMemo() {
  return (memoTopics ??= topicRows());
}

function sourcesMemo() {
  return (memoSources ??= sourceRows());
}

function capabilitiesMemo() {
  return (memoCapabilities ??= capabilityRows());
}

function blogsMemo() {
  return (memoBlogs ??= blogRows());
}

function designsMemo() {
  return (memoDesigns ??= designRows());
}

function diagramsMemo() {
  return (memoDiagrams ??= diagramRows());
}

function helpMemo() {
  return (memoHelp ??= helpRows());
}

function claimsMemo() {
  return (memoClaims ??= claimsRows());
}

export const bundledContent = {
  topics: topicsMemo,
  capabilities: capabilitiesMemo,
  sources: sourcesMemo,
  blogs: blogsMemo,
  designs: designsMemo,
  diagrams: diagramsMemo,
  help: helpMemo,
  claims: claimsMemo,
  topic(slug: string) {
    const topic = topicsMemo().find((row) => row.slug === slug);
    if (!topic) return null;
    const capabilities = capabilitiesMemo().filter((capability) =>
      topic.capability_ids.includes(capability.id),
    );
    return {
      topic,
      children: topicsMemo().filter((row) => row.parent_slug === slug),
      capabilities,
      blogs: blogsMemo().filter((blog) => blog.topic_slug === slug),
    };
  },
  blog(slug: string) {
    const blog = blogsMemo().find((row) => row.slug === slug);
    if (!blog) return null;
    return { blog, citations: citations(blog.cited_source_keys) };
  },
  design(slug: string) {
    const design = designsMemo().find((row) => row.slug === slug);
    if (!design) return null;
    return { design, citations: citations(design.cited_source_keys) };
  },
};
