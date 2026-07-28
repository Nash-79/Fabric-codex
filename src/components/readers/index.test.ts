import { describe, expect, it } from "vitest";
import { resolveReaderShell } from "./index";
import { EditorialReader } from "./EditorialReader";
import { TutorialReader } from "./TutorialReader";
import { ArchitectureReader } from "./ArchitectureReader";
import { LessonReader } from "./LessonReader";

describe("resolveReaderShell", () => {
  it("dispatches each archetype to its documented shell", () => {
    expect(resolveReaderShell("explainer")).toBe(EditorialReader);
    expect(resolveReaderShell("field-guide")).toBe(EditorialReader);
    expect(resolveReaderShell("deep-dive")).toBe(EditorialReader);
    expect(resolveReaderShell("tutorial")).toBe(TutorialReader);
    expect(resolveReaderShell("architecture")).toBe(ArchitectureReader);
    expect(resolveReaderShell("lesson")).toBe(LessonReader);
  });

  it("falls back to EditorialReader for an undefined archetype", () => {
    expect(resolveReaderShell(undefined)).toBe(EditorialReader);
  });

  it("falls back to EditorialReader for an unrecognized archetype", () => {
    expect(resolveReaderShell("not-a-real-archetype" as never)).toBe(EditorialReader);
  });
});
