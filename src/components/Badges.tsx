import { depthMeta, tierMeta } from "@/lib/fabric-theme";

export function DepthBadge({ depth }: { depth: number }) {
  const m = depthMeta[depth as 1 | 2 | 3 | 4 | 5] ?? depthMeta[1];
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  const m = tierMeta[tier as 1 | 2 | 3 | 4 | 5 | 6] ?? tierMeta[6];
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}
