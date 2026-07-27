import type { PresentationArchetype } from "@/lib/content-presentation";
import { EditorialReader } from "./EditorialReader";
import { TutorialReader } from "./TutorialReader";
import { ArchitectureReader } from "./ArchitectureReader";
import { LessonReader } from "./LessonReader";
import type { ReaderComponent } from "./types";

export type { ReaderHeroProps, ReaderComponent } from "./types";

// explainer/deep-dive/field-guide share the same rhythm (no distinct opening block needed) and
// all resolve to EditorialReader, which doubles as the graceful default for undefined/unrecognized
// archetypes — the ~67 not-yet-migrated content files render through this exact path unchanged.
const ARCHETYPE_SHELL: Record<PresentationArchetype, ReaderComponent> = {
  explainer: EditorialReader,
  "deep-dive": EditorialReader,
  "field-guide": EditorialReader,
  tutorial: TutorialReader,
  architecture: ArchitectureReader,
  lesson: LessonReader,
};

export function resolveReaderShell(archetype?: PresentationArchetype): ReaderComponent {
  return (archetype && ARCHETYPE_SHELL[archetype]) ?? EditorialReader;
}
