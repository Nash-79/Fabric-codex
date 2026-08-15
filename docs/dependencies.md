# Dependencies

How third-party packages enter Fabric Atlas and how they get upgraded.

Per `AGENTS.md`: **ask before adding a new production dependency.** This document
covers what happens after one is approved.

## Credits

Fabric Atlas is built on open-source work. Libraries doing substantial work for us,
credited beyond the license files vendored in `node_modules/`:

| Library                                                   | Author           | License | What it does for us                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Feedsmith](https://github.com/macieklamberski/feedsmith) | Maciej Lamberski | MIT     | Parses every feed Atlas ingests — RSS 0.9x/2.0, Atom 0.3/1.0, RDF 0.9/1.0, and JSON Feed 1.0/1.1, with namespace support (`dc:`, `media:`, …). Replaced four hand-rolled regex parsers. Depends on `fast-xml-parser` and `entities`. |

Feedsmith is MIT-licensed; its copyright notice ships in
`node_modules/feedsmith/LICENSE`. We credit it here because it carries the
correctness of the whole watcher ingestion path.

## Watched dependencies

A short, deliberate list in [`scripts/lib/dep-updates.mjs`](../scripts/lib/dep-updates.mjs)
(`WATCHED`) gets an automatic freshness check. This is **not** a whole-tree audit —
that is `npm outdated`. A package belongs on the list when a silent regression in it
would be expensive and hard to attribute.

Currently watched: `feedsmith`.

## Checking for updates

```bash
npm run check:deps            # full report
node scripts/check-deps.mjs --brief   # only what needs attention
node scripts/check-deps.mjs --json    # machine-readable
```

The same check runs inside the SessionStart digest
([`scripts/check-queues.mjs`](../scripts/check-queues.mjs)), which prints a
`Dependencies:` line and a ready-to-paste upgrade command when one is available.
Both are report-only and **never fail** — being offline is not a finding.

Two rules the checker enforces:

- **Stable only.** Prereleases (`beta`, `rc`, `next`) are never offered. Feedsmith's
  3.x line is unreleased and must not be picked up automatically.
- **24-hour hold.** A version published less than 24h ago is reported as _held_, not
  as an available upgrade. This mirrors `minimumReleaseAge` in
  [`bunfig.toml`](../bunfig.toml) — which **npm ignores entirely**, so when the
  install runs through npm this check is the only thing applying that guard.

## Upgrading

Upgrades are applied **locally, tested, then committed by a human**. There is no
Dependabot or Renovate: both open PRs against `main`, which conflicts with the
local-test requirement and fights CI's lockfile self-heal.

```bash
npm install feedsmith@<version>          # pre-commit hook syncs package-lock.json
npm test                                 # the real gate — see below
npm run typecheck                        # catches type changes (especially major bumps)
npm run lint
node scripts/poll-watchers.mjs --dry-run # real-world feed smoke test
```

Then commit `package.json` and `package-lock.json` together.
[`.githooks/pre-commit`](../.githooks/pre-commit) runs
`npm install --package-lock-only` whenever `package.json` is staged, so the lockfile
stays in sync without extra steps.

### What makes a feed-parser upgrade safe

All feed parsing funnels through one module,
[`src/lib/feed-parse.ts`](../src/lib/feed-parse.ts), so a single test file covers
every consumer: [`src/lib/feed-parse.test.ts`](../src/lib/feed-parse.test.ts).
Even [`scripts/poll-watchers.mjs`](../scripts/poll-watchers.mjs) imports that `.ts`
module directly, using Node's native type stripping (unflagged since Node 22.18) —
so the local fallback script and the app cannot drift apart. It pins the behaviours
Atlas depends on, not Feedsmith's internals:

- Atom `rel="alternate"` wins over an earlier `rel="replies"` link — otherwise the
  comments page gets queued as the article.
- A non-permalink RSS `<guid>` is an identifier, never a URL.
- Entity decoding: named, numeric (`&#8217;`), and CDATA.
- JSON Feed `url` → `external_url` → `id` precedence.
- **Non-feed input returns `[]` and never throws.** This one is load-bearing: the
  watcher discovery ladder in `src/lib/source-watcher.server.ts` speculatively
  parses HTML pages as feeds and relies on an empty result to fall through to the
  sitemap/listing/page strategies. If an upgrade makes this throw, watcher
  discovery still works but reports every fall-through as an error.

Note that Feedsmith validates structure: RSS needs `<channel>`, JSON Feed needs
`version`. Test fixtures must be _valid_ feeds, not fragments.

CI already runs `npm test` and `npm run typecheck` on every push and PR, so once a
dependency is covered by tests its upgrades are gated automatically.

### Not covered here

`bun.lock` and `package-lock.json` both exist; standardising on one package manager
is tracked in [`docs/analysis-and-modernisation.md`](analysis-and-modernisation.md).
The release-age guard above is enforced by our own check regardless of which manager
runs the install.
