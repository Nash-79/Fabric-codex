export type Accent = "teal" | "indigo" | "amber" | "yellow" | "violet" | "rose";

export const accentClasses: Record<
  Accent,
  { dot: string; chip: string; ring: string; grad: string }
> = {
  teal: {
    dot: "bg-teal-400",
    chip: "bg-teal-500/10 text-teal-300 border-teal-500/20",
    ring: "ring-teal-500/30",
    grad: "from-teal-400/20 to-transparent",
  },
  indigo: {
    dot: "bg-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    ring: "ring-indigo-500/30",
    grad: "from-indigo-400/20 to-transparent",
  },
  amber: {
    dot: "bg-amber-400",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    ring: "ring-amber-500/30",
    grad: "from-amber-400/20 to-transparent",
  },
  yellow: {
    dot: "bg-yellow-400",
    chip: "bg-yellow-500/10 text-yellow-200 border-yellow-500/20",
    ring: "ring-yellow-500/30",
    grad: "from-yellow-400/20 to-transparent",
  },
  violet: {
    dot: "bg-violet-400",
    chip: "bg-violet-500/10 text-violet-300 border-violet-500/20",
    ring: "ring-violet-500/30",
    grad: "from-violet-400/20 to-transparent",
  },
  rose: {
    dot: "bg-rose-400",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    ring: "ring-rose-500/30",
    grad: "from-rose-400/20 to-transparent",
  },
};

export function accent(a: string | null | undefined) {
  return accentClasses[(a as Accent) ?? "teal"] ?? accentClasses.teal;
}

export const tierMeta = {
  1: {
    label: "T1 · Microsoft Learn",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  2: { label: "T2 · Fabric blog", cls: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  3: { label: "T3 · MS GitHub", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  4: { label: "T4 · MVP / community", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  5: { label: "T5 · Vendor", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  6: { label: "T6 · Unknown", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
} as const;

export const depthMeta = {
  1: { label: "L1 · Conceptual", cls: "bg-white/5 text-white/70 border-white/10" },
  2: { label: "L2 · Practitioner", cls: "bg-teal-500/10 text-teal-300 border-teal-500/20" },
  3: { label: "L3 · Architect", cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" },
  4: { label: "L4 · Performance", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  5: { label: "L5 · Internals", cls: "bg-rose-500/10 text-rose-300 border-rose-500/20" },
} as const;
