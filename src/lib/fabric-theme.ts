export type Accent = "teal" | "indigo" | "amber" | "yellow" | "violet" | "rose";

export const accentClasses: Record<Accent, { dot: string; chip: string; ring: string; grad: string }> = {
  teal:   { dot: "bg-teal-400",   chip: "bg-teal-500/10 text-teal-300 border-teal-500/20",     ring: "ring-teal-500/30",   grad: "from-teal-400/20 to-transparent" },
  indigo: { dot: "bg-indigo-400", chip: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20", ring: "ring-indigo-500/30", grad: "from-indigo-400/20 to-transparent" },
  amber:  { dot: "bg-amber-400",  chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",   ring: "ring-amber-500/30",  grad: "from-amber-400/20 to-transparent" },
  yellow: { dot: "bg-yellow-400", chip: "bg-yellow-500/10 text-yellow-200 border-yellow-500/20",ring: "ring-yellow-500/30", grad: "from-yellow-400/20 to-transparent" },
  violet: { dot: "bg-violet-400", chip: "bg-violet-500/10 text-violet-300 border-violet-500/20",ring: "ring-violet-500/30", grad: "from-violet-400/20 to-transparent" },
  rose:   { dot: "bg-rose-400",   chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",     ring: "ring-rose-500/30",   grad: "from-rose-400/20 to-transparent" },
};

export function accent(a: string | null | undefined) {
  return accentClasses[(a as Accent) ?? "teal"] ?? accentClasses.teal;
}
