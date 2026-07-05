import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader } from "@/components/SiteHeader";

// Small pieces shared across every Settings panel — layout chrome (Shell, Panel, Empty),
// form fields (Field, Area), and formatting helpers (statusBadge, pct, splitTags).

export type AppRole = "admin" | "editor" | "user";
export const roleOptions: AppRole[] = ["user", "editor", "admin"];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function statusBadge(status?: string) {
  const cls =
    status === "approved" ||
    status === "verified" ||
    status === "published" ||
    status === "ingested"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : status === "pending" || status === "queued" || status === "draft"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : status === "suspended" || status === "rejected" || status === "failed"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
          : "border-border bg-card text-muted-foreground";
  return <Badge className={`rounded-sm border text-[11px] ${cls}`}>{status ?? "unknown"}</Badge>;
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

export function splitTags(value: unknown) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-border bg-card text-foreground"
      />
    </div>
  );
}

export function Area({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <Textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border-border bg-card text-foreground"
      />
    </div>
  );
}
