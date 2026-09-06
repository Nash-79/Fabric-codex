# Phase 1 — The curriculum spine

**Fixes:** D1 (no curriculum), D2 (lesson metadata), D3 (no server progress)
**Depends on:** Phase 0 · **Critical path:** WP1.1 — everything in the learning experience needs it

This is the core of the whole effort. Today `/topics` is a _product-area reference tree_, not a
learning sequence, and there is no ordering primitive anywhere in the schema.

← [Master plan](README.md) · [Baseline](audit-baseline.md)

---

## WP1.1 — Ordering primitive (schema + siblings)

**Problem.** [getContentSiblings](../../../src/lib/atlas.functions.ts#L213-L238) orders by:

```ts
.order("updated_at", { ascending: false })
.order("slug", { ascending: true });
```

Prev/Next is **recency order**. Editing an old article silently reorders "next" for every reader.
`content_items` has no `sort_order`, `sequence`, `prerequisite_id`, or `path_id`. `topics` has
`sort_order`; content does not.

**Schema.** New migration:

```sql
create table public.learning_paths (
  slug text primary key,
  title text not null,
  description text not null default '',
  audience text not null default '',          -- who it's for, in plain words
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.path_items (
  path_slug text not null references public.learning_paths(slug) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  position int not null,
  optional boolean not null default false,
  primary key (path_slug, content_item_id)
);
create unique index path_items_position_idx on public.path_items(path_slug, position);

alter table public.content_items
  add column prerequisite_ids uuid[] not null default '{}';
```

Follow the existing RLS convention exactly: `grant select ... to anon, authenticated`,
`enable row level security`, `for select using (true)`, **no** authenticated-write policy — writes
go through server functions with the service role.

**Then fix `getContentSiblings`**: order by `path_items.position` when the item is in a path
(accept an optional `pathSlug` so an item in two paths resolves correctly via the `?from` param the
breadcrumb already uses); fall back to `updated_at DESC` only for items outside any path.

**This single change makes Next/Prev correct and stops edits from reshuffling reading order.**

**Watch out.**

- `content_items` is versioned (`supersedes_id`, one active row per `(kind, slug)`). `path_items`
  references `id`, which changes on republish. Either reference `(kind, slug)` instead, or have the
  publish path carry `path_items` rows forward to the new active id. **Decide this before writing
  the migration** — getting it wrong silently empties paths on the next publish.
- `prerequisite_ids` has the same versioning concern; prefer slugs over uuids for stability.

**Gate.** `npm run verify:schema`; `python scripts/validate_migration.py`; unit test that siblings
follow path order. **Regression test for D1:** touch `updated_at` on an old article and assert the
sequence does **not** change.

---

## WP1.2 — Server-side progress, anonymous-first

**Decision (from the user): anonymous-first with optional sign-in.** Public reading does not change.

**Schema.**

```sql
create table public.user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_item_slug text not null,             -- slug, not id: survives republish
  content_kind text not null check (content_kind in ('article','design','lesson')),
  status text not null default 'in_progress'
    check (status in ('in_progress','completed')),
  percent int not null default 0 check (percent between 0 and 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_kind, content_item_slug)
);
```

RLS: `using (auth.uid() = user_id)` for select/insert/update — the per-user pattern already used by
`favorites`.

**Merge on sign-in.** Keep the three existing hooks as the anonymous path:

| Hook                                                             | Key                      |
| ---------------------------------------------------------------- | ------------------------ |
| [use-lesson-progress.ts](../../../src/lib/use-lesson-progress.ts)   | `fa:lesson-done`         |
| [use-reading-progress.ts](../../../src/lib/use-reading-progress.ts) | `fa:read:{kind}:{slug}`  |
| [use-step-progress.ts](../../../src/lib/use-step-progress.ts)       | `fa:steps:{kind}:{slug}` |

On first authenticated load, run a **union + max** merge: a slug completed in _either_ place is
completed; `percent` takes the max; `completed_at` takes the earliest non-null. Never let the server
downgrade a local completion — that reads as data loss. Mark the local store merged (a
`fa:merged-at` stamp) so it runs once per device, then read through to the server.

**Keep it offline-tolerant.** The app already ships a service worker and `OfflineIndicator`. Writes
should queue locally and flush on reconnect rather than being lost.

**Gate.** Manual, and worth doing carefully: sign out → complete a lesson → sign in → progress
merged; open a different browser → progress present; go offline → complete a lesson → reconnect →
it syncs.

---

## WP1.3 — Curriculum content model

**Seed paths from real sources, do not invent them.** Two tracks:

1. **Foundation track** — derived from the capability tree and `content/topics.json`
   (9 roots → 34 children, which already carry `order`). Beginner → practitioner.
2. **Expert track** — lift the **"Practical Expert Learning Path & Milestones"** sequence that
   already exists in `fabric_spark_toolkit/spark_internals.html` §43. It is a real, opinionated
   ordering with a stated philosophy worth preserving:

   > "Thirty-six sections is a reference, not a curriculum. This is the order that builds
   > understanding rather than trivia, with a concrete artifact at each stage so learning is
   > verified by doing."

   Its recommended sequence: Catalyst Optimizer → AQE → NEE Fallback → Column Stats & SQL Tuning →
   Delta Optimization → Config Advisor → Table Maintenance Cadence → Query Plan Reading.

**Backfill `lesson_meta`** for all lessons — currently **2 of 15**. The Zod schema
([content-presentation.ts:61](../../../src/lib/content-presentation.ts#L61)) already defines
`objectives`, `prerequisites`, `estimated_minutes`, `completion_outcome`, and
[LessonReader.tsx:38](../../../src/components/readers/LessonReader.tsx#L38) already renders them. This
is filling in a built feature, not building one.

Populate `prerequisites` as **linkable slugs**, not the free text the schema currently allows —
today it is `[]` on all 15 anyway, so there is no migration cost to tightening it.

**Gate.** `npm run validate:content`; every lesson has `lesson_meta`; every `prerequisites` entry
resolves to a real slug.

---

## WP1.4 — Rebuild `/learn`

**Problem.** [learn.tsx](../../../src/routes/learn.tsx) (178 lines) fakes progression with slug-suffix
string matching:

```ts
function familyOf(slug) {
  /* strips -beginner/-intermediate/-expert */
}
function nextTierSlug(slug, tierId) {
  /* label only */
}
```

Tiers come from filtering `depth_levels` against hardcoded `[1,2]/[3]/[4,5]`, and **"Next:" renders
as plain text, not a link**.

**Build.**

- Path view: ordered modules with position, not a flat card grid.
- Per-path progress ring reading `user_progress` (falling back to localStorage when anonymous).
- **Prerequisite chips that link** — and that visibly indicate "not yet done".
- "Resume where you left off" — `ResumeReadingPill` already exists; reuse it, don't rebuild.
- An honest **"what you'll be able to do"** outcome per module, from `completion_outcome`.
- Make "Next" a real `<Link>`.

**Reuse, don't rebuild:** `MarkLessonCompleteButton`, `StepSequence`, `ResumeReadingPill`,
`KindBadge`, `Badges` all exist and work.

**Keep the tier concept** — Beginner (L1–L2) / Intermediate (L3) / Expert (L4–L5) is a documented
domain rule in [CLAUDE.md](../../../CLAUDE.md). Paths sit _alongside_ tiers as an ordering layer, they
do not replace them.

**Gate.** `npm run typecheck && npm run lint && npm test`; manual walk of a full path start→finish
in both themes, signed out and signed in; keyboard-only navigation works.

---

## Phase 1 exit criteria

- [ ] `learning_paths` + `path_items` + `prerequisite_ids` migrated; `verify:schema` green
- [ ] Siblings follow path order; **D1 regression test passes** (touching `updated_at` does not reorder)
- [ ] `user_progress` live with `auth.uid()` RLS; sign-in merge verified across two browsers
- [ ] `lesson_meta` on 15 of 15 lessons; all prerequisites resolve
- [ ] `/learn` shows ordered paths with working progress and linked prerequisites
- [ ] Anonymous reading and progress still work with no sign-in
