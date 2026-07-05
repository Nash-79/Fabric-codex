import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { publishAllBundled, publishFromFile } from "@/lib/settings.functions";
import { Panel } from "@/components/settings/shared";

const PUBLISH_DIR: Record<string, string> = {
  source: "sources",
  article: "articles",
  design: "designs",
  lesson: "lessons",
};

const PUBLISH_ALL_ACTION_STYLE: Record<string, string> = {
  published: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  "skipped-unchanged": "border-border bg-transparent text-muted-foreground",
  blocked: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  failed: "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

function PublishAllPanel() {
  const publishAllFn = useServerFn(publishAllBundled);
  const [force, setForce] = useState(false);

  const publishAll = useMutation({
    mutationFn: () => publishAllFn({ data: { force } }),
    onSuccess: (res) => {
      const s = (
        res as { summary?: { published: number; skipped: number; blocked: number; failed: number } }
      ).summary;
      if (!s) return;
      if (s.failed > 0) {
        toast.error(`Published ${s.published}, ${s.failed} failed — see results below.`);
      } else if (s.blocked > 0) {
        toast.warning(`Published ${s.published}, ${s.blocked} blocked — see results below.`);
      } else {
        toast.success(`Published ${s.published} item(s), ${s.skipped} already up to date.`);
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const summary = (
    publishAll.data as
      | {
          summary?: {
            items: Array<Record<string, unknown>>;
            published: number;
            skipped: number;
            blocked: number;
            failed: number;
          };
        }
      | undefined
  )?.summary;

  return (
    <Panel title="Publish all bundled content">
      <p className="mb-3 text-xs text-muted-foreground">
        Publishes every <code className="text-teal-300">content/sources</code>,{" "}
        <code className="text-teal-300">content/articles</code>,{" "}
        <code className="text-teal-300">content/designs</code>, and{" "}
        <code className="text-teal-300">content/lessons</code>, plus{" "}
        <code className="text-teal-300">content/diagrams/assets.json</code> entry bundled into this
        deploy, in the safe order (sources → diagrams → articles/designs/lessons that cite them) —
        using the same versioned publish path as pasting one file below, so verified claims and
        version history are preserved exactly the same way. Items unchanged since the last publish
        are skipped; an article/design/lesson blocked on an unpublished source is reported, not
        force-published. Only sees content committed and{" "}
        <span className="text-foreground">deployed</span> — new files need a redeploy first.
      </p>

      <div className="mb-3 flex items-center gap-3">
        <Button size="sm" onClick={() => publishAll.mutate()} disabled={publishAll.isPending}>
          {publishAll.isPending ? "Publishing…" : "Publish all"}
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Force (republish even if unchanged)
        </label>
      </div>

      {summary && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
              {summary.published} published
            </Badge>
            <Badge className="border-border bg-transparent text-muted-foreground">
              {summary.skipped} unchanged
            </Badge>
            {summary.blocked > 0 && (
              <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                {summary.blocked} blocked
              </Badge>
            )}
            {summary.failed > 0 && (
              <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200">
                {summary.failed} failed
              </Badge>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.items.map((item: any) => (
                <TableRow key={`${item.kind}-${item.slug}-${item.file}`}>
                  <TableCell className="text-xs text-muted-foreground">{item.kind}</TableCell>
                  <TableCell className="font-mono text-xs">{item.slug}</TableCell>
                  <TableCell>
                    <Badge className={PUBLISH_ALL_ACTION_STYLE[item.action] ?? ""}>
                      {item.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.reason ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Panel>
  );
}

export function PublishPanel({ onDone }: { onDone: () => void }) {
  const publishFn = useServerFn(publishFromFile);
  const [kind, setKind] = useState<"source" | "article" | "design" | "lesson" | "diagram">(
    "source",
  );
  const [json, setJson] = useState("");

  const publish = useMutation({
    mutationFn: () => {
      let payload: unknown;
      try {
        payload = JSON.parse(json);
      } catch {
        throw new Error("That isn't valid JSON — paste the full content/*.json file.");
      }
      return publishFn({ data: { kind, payload } });
    },
    onSuccess: (res) => {
      const r = (res as { result?: Record<string, unknown> })?.result ?? {};
      const slug = (r.slug as string) ?? "";
      let extra: string;
      if (kind === "source") extra = `${r.claimsInserted ?? 0} claim(s) inserted (pending)`;
      else if (kind === "diagram")
        extra = `${r.registered ?? 0} diagram(s) registered: ${(r.slugs as string[])?.join(", ") ?? ""}`;
      else extra = `${r.citedSources ?? 0} cited source(s), v${r.version ?? 1}`;
      const label = kind === "diagram" ? "diagram(s)" : `${kind} "${slug}"`;
      toast.success(`Published ${label}. ${extra}.`);
      setJson("");
      onDone();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <>
      <PublishAllPanel />
      <Panel title="Publish from a single file">
        <p className="mb-3 text-xs text-muted-foreground">
          Laptop agents author content keylessly and write{" "}
          <code className="text-teal-300">content/sources/*.json</code>,{" "}
          <code className="text-teal-300">content/articles/*.json</code>,{" "}
          <code className="text-teal-300">content/designs/*.json</code>,{" "}
          <code className="text-teal-300">content/lessons/*.json</code>, and diagram entries to git.
          Use this for one file before a redeploy. Re-publishing a source keeps its{" "}
          <span className="text-foreground">verified</span> claims and only refreshes the pending
          ones — publishing never un-verifies human review. Articles, designs, and lessons always
          create a new version — the prior version is archived, never overwritten. For an article
          whose embedded diagram is new, publish the{" "}
          <span className="text-foreground">Diagram(s)</span> first (paste{" "}
          <code className="text-teal-300">content/diagrams/assets.json</code>) so the article's
          embedded-diagram validation passes.
        </p>

        <div className="mb-3 flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="h-8 w-40 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="source">Source (+ claims)</SelectItem>
              <SelectItem value="article">Article</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="lesson">Lesson</SelectItem>
              <SelectItem value="diagram">Diagram(s) / assets.json</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => publish.mutate()}
            disabled={!json.trim() || publish.isPending}
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </Button>
        </div>

        <Textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={
            kind === "diagram"
              ? "Paste a diagram entry or the whole content/diagrams/assets.json array…"
              : `Paste the content/${PUBLISH_DIR[kind]}/<slug>.json the agent wrote…`
          }
          className="min-h-[320px] border-border bg-card font-mono text-xs text-foreground"
        />
      </Panel>
    </>
  );
}
