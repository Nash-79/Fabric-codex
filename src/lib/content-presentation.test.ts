import { describe, expect, it } from "vitest";
import { presentationProfileSchema, lessonMetaSchema } from "./content-presentation";

describe("presentationProfileSchema", () => {
  it("accepts a minimal valid profile and applies defaults", () => {
    const result = presentationProfileSchema.parse({ archetype: "deep-dive" });
    expect(result).toMatchObject({
      archetype: "deep-dive",
      hero_treatment: "standard",
      reading_density: "standard",
      toc_depth: "h2-only",
      surface_prerequisites: false,
      surface_outcomes: false,
    });
  });

  it("accepts a fully specified profile", () => {
    const result = presentationProfileSchema.parse({
      archetype: "architecture",
      accent: "teal",
      hero_treatment: "diagram-led",
      featured_diagram: "lakehouse-direct-lake-bi-architecture",
      reading_density: "spacious",
      toc_depth: "h2-h3",
      surface_prerequisites: true,
      surface_outcomes: true,
    });
    expect(result.featured_diagram).toBe("lakehouse-direct-lake-bi-architecture");
  });

  it("rejects an archetype outside the closed vocabulary", () => {
    expect(() => presentationProfileSchema.parse({ archetype: "blog-post" })).toThrow();
  });

  it("rejects unknown keys (closed schema, no arbitrary layout strings)", () => {
    expect(() =>
      presentationProfileSchema.parse({
        archetype: "explainer",
        className: "my-custom-css-class",
      }),
    ).toThrow();
  });

  it("requires archetype", () => {
    expect(() => presentationProfileSchema.parse({})).toThrow();
  });
});

describe("lessonMetaSchema", () => {
  const valid = {
    summary: "A short lesson summary.",
    level: "beginner",
    estimated_minutes: 15,
    objectives: ["Do one thing"],
    completion_outcome: "You can do the thing.",
  };

  it("accepts a valid lesson_meta and defaults prerequisites to empty", () => {
    const result = lessonMetaSchema.parse(valid);
    expect(result.prerequisites).toEqual([]);
  });

  it("rejects a level outside beginner/intermediate/expert", () => {
    expect(() => lessonMetaSchema.parse({ ...valid, level: "advanced" })).toThrow();
  });

  it("rejects estimated_minutes outside 1-180", () => {
    expect(() => lessonMetaSchema.parse({ ...valid, estimated_minutes: 0 })).toThrow();
    expect(() => lessonMetaSchema.parse({ ...valid, estimated_minutes: 500 })).toThrow();
  });

  it("requires at least one objective", () => {
    expect(() => lessonMetaSchema.parse({ ...valid, objectives: [] })).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => lessonMetaSchema.parse({ ...valid, difficulty: "easy" })).toThrow();
  });
});
