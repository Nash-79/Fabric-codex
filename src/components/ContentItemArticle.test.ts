import { describe, expect, it } from "vitest";
import { wrapTeachingPrimitiveRuns } from "./ContentItemArticle";

describe("wrapTeachingPrimitiveRuns", () => {
  it("groups consecutive [!STEP] blocks into one step-sequence wrapper, leaving a trailing [!CHECKPOINT] outside it", () => {
    // Mirrors the real walkthrough content/articles/data-factory.json shipped in the Editorial
    // Experience Revamp's pilot (Phase 7) — the first live [!STEP]/[!CHECKPOINT] usage.
    const body = [
      "Some intro prose.",
      "",
      "> [!STEP] Create a Copy job",
      "> Pick a source connection.",
      "",
      "> [!STEP] Point it at a destination",
      "> Set a lakehouse table as the target.",
      "",
      "> [!STEP] Run it and check the Monitor hub",
      "> Trigger the Copy job manually.",
      "",
      "> [!CHECKPOINT]",
      "> You should see a completed run.",
      "",
      "Trailing prose after the walkthrough.",
    ].join("\n");

    const wrapped = wrapTeachingPrimitiveRuns(body);

    expect(wrapped).toContain('<div data-step-sequence="1"');
    // All three STEP blocks are inside the single sequence wrapper.
    const sequenceStart = wrapped.indexOf('<div data-step-sequence="1"');
    const sequenceEnd = wrapped.indexOf("</div>", sequenceStart);
    const sequenceBlock = wrapped.slice(sequenceStart, sequenceEnd);
    expect(sequenceBlock).toContain("Create a Copy job");
    expect(sequenceBlock).toContain("Point it at a destination");
    expect(sequenceBlock).toContain("Run it and check the Monitor hub");
    // The CHECKPOINT callout is a standalone blockquote, not swept into the step sequence.
    expect(sequenceBlock).not.toContain("CHECKPOINT");
    expect(wrapped.slice(sequenceEnd)).toContain("[!CHECKPOINT]");
    expect(wrapped).toContain("Trailing prose after the walkthrough.");
  });

  it("does not wrap a lone [!STEP] block preceded by another callout", () => {
    const body = ["> [!NOTE]", "> Just a note, not a sequence.", "", "Some prose."].join("\n");
    const wrapped = wrapTeachingPrimitiveRuns(body);
    expect(wrapped).not.toContain("data-step-sequence");
    expect(wrapped).toContain("[!NOTE]");
  });

  it("starts a new numbered section slug after a heading, without affecting step grouping", () => {
    const body = [
      "## Setup",
      "",
      "> [!STEP] First step",
      "> Do the first thing.",
      "",
      "> [!STEP] Second step",
      "> Do the second thing.",
    ].join("\n");
    const wrapped = wrapTeachingPrimitiveRuns(body);
    expect(wrapped).toContain('data-section="setup"');
  });
});
