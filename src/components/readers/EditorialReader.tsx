import { ContentHero } from "@/components/ContentHero";
import type { ReaderHeroProps } from "./types";

// Default/fallback shell for explainer, deep-dive, field-guide, and any undefined/unrecognized
// archetype (the vast majority of not-yet-migrated content). Must render identically to the
// pre-Phase-3 hero — no opening block, same rhythm for all three archetypes it covers.
export function EditorialReader(props: ReaderHeroProps) {
  return <ContentHero {...props} />;
}
