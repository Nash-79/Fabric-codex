import { z } from "zod";

// Plain-JS mirror of src/lib/content-presentation.ts for scripts/validate-content.mjs, which
// is unbuilt Node ESM and cannot import a .ts module directly. Keep both files in sync.

export const PRESENTATION_ARCHETYPES = [
  "explainer",
  "field-guide",
  "tutorial",
  "deep-dive",
  "architecture",
  "lesson",
];

// Mirrors CAPABILITY_NAMES' accent vocabulary (src/lib/capability-names.ts).
export const ACCENT_OPTIONS = ["indigo", "amber", "violet", "teal", "rose", "yellow"];

export const HERO_TREATMENTS = ["standard", "minimal", "diagram-led"];
export const READING_DENSITY = ["compact", "standard", "spacious"];
export const TOC_DEPTH = ["none", "h2-only", "h2-h3"];

export const presentationProfileSchema = z
  .object({
    archetype: z.enum(PRESENTATION_ARCHETYPES),
    accent: z.enum(ACCENT_OPTIONS).optional(),
    hero_treatment: z.enum(HERO_TREATMENTS).default("standard"),
    featured_diagram: z.string().min(1).max(200).optional(),
    reading_density: z.enum(READING_DENSITY).default("standard"),
    toc_depth: z.enum(TOC_DEPTH).default("h2-only"),
    surface_prerequisites: z.boolean().default(false),
    surface_outcomes: z.boolean().default(false),
  })
  .strict();

// Mirrors learning-author.md's Beginner/Intermediate/Expert vocabulary.
export const LESSON_LEVELS = ["beginner", "intermediate", "expert"];

export const lessonMetaSchema = z
  .object({
    summary: z.string().min(1).max(300),
    level: z.enum(LESSON_LEVELS),
    estimated_minutes: z.number().int().min(1).max(180),
    objectives: z.array(z.string().min(1)).min(1).max(6),
    prerequisites: z.array(z.string().min(1)).max(6).default([]),
    completion_outcome: z.string().min(1).max(300),
  })
  .strict();
