import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { submitContentFeedback, type ContentFeedbackCategory } from "@/lib/atlas.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TocEntry } from "@/components/ContentTocSidebar";

const CATEGORIES: Array<{ value: ContentFeedbackCategory; label: string }> = [
  { value: "factual_error", label: "Factual error" },
  { value: "outdated", label: "Outdated" },
  { value: "unclear", label: "Unclear / confusing" },
  { value: "broken_link", label: "Broken link or diagram" },
  { value: "missing_citation", label: "Missing citation" },
  { value: "other", label: "Other" },
];

// Standardized feedback capture, reused everywhere a reader can report an issue on a piece of
// content: the article toolbar (whole-item report, no default section) and the inline per-heading
// trigger (section pre-selected, still changeable — the reader may be reporting on a passage that
// spans into a neighboring section). One component, one dialog shape, one submission path, so
// every surface in the app that grows a "report an issue" affordance behaves identically.
export function ContentFeedbackButton({
  contentItemId,
  sections = [],
  defaultSectionId,
  variant = "toolbar",
}: {
  contentItemId: string;
  /** Headings the reader can attribute feedback to. Empty = article-level only. */
  sections?: TocEntry[];
  /** Section to preselect, e.g. whatever the scroll-spy currently has active. */
  defaultSectionId?: string;
  /** "toolbar" = labeled button (page-level); "inline" = compact icon trigger (per-heading). */
  variant?: "toolbar" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ContentFeedbackCategory>("factual_error");
  const [body, setBody] = useState("");
  const [sectionId, setSectionId] = useState<string>(defaultSectionId ?? "");
  const submitFn = useServerFn(submitContentFeedback);
  const headings = sections.filter((s) => s.kind === "heading" || s.kind === "subheading");

  const submit = useMutation({
    mutationFn: () => {
      const section = headings.find((h) => h.id === sectionId);
      return submitFn({
        data: {
          contentItemId,
          category,
          body,
          sectionId: section?.id,
          sectionTitle: section?.title,
        },
      });
    },
    onSuccess: () => {
      toast.success("Thanks — your feedback was submitted for review.");
      setOpen(false);
      setBody("");
      setCategory("factual_error");
    },
    onError: (error: Error) => {
      toast.error(
        error.message.includes("Forbidden") || error.message.includes("auth")
          ? "Sign in to report an issue."
          : error.message || "Could not submit feedback.",
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSectionId(defaultSectionId ?? "");
      }}
    >
      <DialogTrigger asChild>
        {variant === "inline" ? (
          <button
            type="button"
            aria-label="Give feedback on this section"
            title="Give feedback on this section"
            className="no-print ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-teal-500/40 opacity-0 transition hover:text-teal-500 group-hover:opacity-100"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="no-print h-10 border-border bg-card text-foreground"
          >
            <Flag className="mr-2 h-4 w-4" />
            Report an issue
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Spotted something wrong or outdated? Your report is reviewed and, when actionable,
            routed into the editorial queue for a fix — it never changes the article directly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {headings.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Section</label>
              <Select
                value={sectionId || "__none"}
                onValueChange={(v) => setSectionId(v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Whole article / not sure</SelectItem>
                  {headings.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Category</label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ContentFeedbackCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">What's wrong?</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue — quote the specific sentence if you can."
              rows={5}
              maxLength={4000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !body.trim()}
          >
            {submit.isPending ? "Submitting…" : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
