import type { ComponentType } from "react";
import type { accent as accentFn } from "@/lib/fabric-theme";
import type { PresentationProfile } from "@/lib/content-presentation";

// Editorial Experience Revamp, Phase 3: the prop contract every archetype-specific reader shell
// (EditorialReader/TutorialReader/ArchitectureReader/LessonReader) receives. Shells are thin,
// stateless, effect-free — they render <ContentHero/> plus an optional opening-rhythm block.
// All cross-cutting state/effects/layout stay in ReaderShell (the controller); shells never own
// the <article> tag, the action bar, or any drawer/rail.
export type ReaderHeroProps = {
  item: {
    kind: string;
    title: string;
    summary?: string | null;
    body_md?: string | null;
    depth_levels?: number[] | null;
    tags?: string[] | null;
    updated_at?: string | null;
    version?: number | null;
    // Present on the fetched row (getContentItem's select("*")) but not read by ContentHero —
    // shells use these for their archetype-specific opening blocks.
    scenario?: string | null;
    constraints?: Record<string, unknown> | null;
    lesson_meta?: {
      summary: string;
      level: "beginner" | "intermediate" | "expert";
      estimated_minutes: number;
      objectives: string[];
      prerequisites: string[];
      completion_outcome: string;
    } | null;
  };
  citationCount: number;
  diagramCount: number;
  hasPreview: boolean;
  presentationProfile?: PresentationProfile;
  accent: ReturnType<typeof accentFn>;
};

export type ReaderComponent = ComponentType<ReaderHeroProps>;
