# Ingestion queue

One source per line: `<url> tier=<1-6>` (tier optional — the curator infers it from the
domain if omitted). Lines starting with `#` are comments. Run `/ingest-batch` to process;
processed lines are moved to the Done section below with the resulting content file.

## Queued

## Done

# blog INDEX pages — curator picked substantive Fabric posts and
# ingested each post as its own source
https://bradcoles-dev.github.io/index.html#blog tier=4 -> content/sources/bradcoles-declarative-transformation.json, content/sources/bradcoles-fabric-mirroring-before-you-commit.json, content/sources/bradcoles-fabric-private-links.json
https://milescole.dev/categories/ tier=4 -> content/sources/milescole-deletion-vectors.json, content/sources/milescole-optimized-write-fabric.json, content/sources/milescole-table-compaction.json
