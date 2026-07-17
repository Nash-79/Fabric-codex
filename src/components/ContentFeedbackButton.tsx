import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
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

const CATEGORIES: Array<{ value: ContentFeedbackCategory; label: string }> = [
  { value: "factual_error", label: "Factual error" },
  { value: "outdated", label: "Outdated" },
  { value: "unclear", label: "Unclear / confusing" },
  { value: "broken_link", label: "Broken link or diagram" },
  { value: "missing_citation", label: "Missing citation" },
  { value: "other", label: "Other" },
];

export function ContentFeedbackButton({ contentItemId }: { contentItemId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ContentFeedbackCategory>("factual_error");
  const [body, setBody] = useState("");
  const submitFn = useServerFn(submitContentFeedback);

  const submit = useMutation({
    mutationFn: () => submitFn({ data: { contentItemId, category, body } }),
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="no-print h-10 border-border bg-card text-foreground"
        >
          <Flag className="mr-2 h-4 w-4" />
          Report an issue
        </Button>
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
              placeholder="Describe the issue — quote the specific sentence or section if you can."
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
