import { z } from "zod";

// Editorial Experience Revamp, Phase 1: the constrained presentation contract every content
// item may optionally carry. This is a closed vocabulary, not a place for freeform layout
// code/class strings -- new options must be added here as enum values, never accepted as
// arbitrary strings from content authors.
//
// scripts/validate-content.mjs is plain Node ESM with no build step and cannot import this
// TS module directly. Its mirror lives at scripts/lib/content-presentation.mjs -- keep both in
// sync when this file changes.

export const PRESENTATION_ARCHETYPES = [
  "explainer",
  "field-guide",
  "tutorial",
  "deep-dive",
  "architecture",
  "lesson",
] as const;
export type PresentationArchetype = (typeof PRESENTATION_ARCHETYPES)[number];

// Reuses the same accent vocabulary as CAPABILITY_NAMES (src/lib/capability-names.ts) rather
// than inventing a second color taxonomy.
export const ACCENT_OPTIONS = ["indigo", "amber", "violet", "teal", "rose", "yellow"] as const;
export type AccentOption = (typeof ACCENT_OPTIONS)[number];

export const HERO_TREATMENTS = ["standard", "minimal", "diagram-led"] as const;
export type HeroTreatment = (typeof HERO_TREATMENTS)[number];

export const READING_DENSITY = ["compact", "standard", "spacious"] as const;
export type ReadingDensity = (typeof READING_DENSITY)[number];

export const TOC_DEPTH = ["none", "h2-only", "h2-h3"] as const;
export type TocDepth = (typeof TOC_DEPTH)[number];

export const presentationProfileSchema = z
  .object({
    archetype: z.enum(PRESENTATION_ARCHETYPES),
    accent: z.enum(ACCENT_OPTIONS).optional(),
    hero_treatment: z.enum(HERO_TREATMENTS).default("standard"),
    // A registered diagram slug (basename, no path/extension) -- validated against
    // content/diagrams/assets.json at content-validation time, never a free path/URL/class.
    featured_diagram: z.string().min(1).max(200).optional(),
    reading_density: z.enum(READING_DENSITY).default("standard"),
    toc_depth: z.enum(TOC_DEPTH).default("h2-only"),
    surface_prerequisites: z.boolean().default(false),
    surface_outcomes: z.boolean().default(false),
  })
  .strict();
export type PresentationProfile = z.infer<typeof presentationProfileSchema>;

// Mirrors learning-author.md's existing Beginner/Intermediate/Expert vocabulary and its
// L1-2/L3/L4-5 depth-level mapping -- do not introduce a second level taxonomy.
export const LESSON_LEVELS = ["beginner", "intermediate", "expert"] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

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
export type LessonMeta = z.infer<typeof lessonMetaSchema>;
