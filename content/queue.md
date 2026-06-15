# Ingestion queue

One source per line: `<url> tier=<1-6>` (tier optional — the curator infers it from the
domain if omitted). Lines starting with `#` are comments. Run `/ingest-batch` to process;
processed lines are moved to the Done section below with the resulting content file.

## Queued

# AI & APIs section — these three leaf topics have no sources yet, so /publish-topic
# cannot run for them. Ingest, verify the claims in the Registry, then publish each.
# Confirm the exact Learn URL when ingesting (Fabric IQ docs are new and may move).
https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent tier=1
https://learn.microsoft.com/en-us/fabric/data-engineering/api-graphql-overview tier=1
https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-iq-overview tier=1

## Done

# blog INDEX pages — curator picked substantive Fabric posts and
# ingested each post as its own source
https://bradcoles-dev.github.io/index.html#blog tier=4 -> content/sources/bradcoles-declarative-transformation.json, content/sources/bradcoles-fabric-mirroring-before-you-commit.json, content/sources/bradcoles-fabric-private-links.json
https://milescole.dev/categories/ tier=4 -> content/sources/milescole-deletion-vectors.json, content/sources/milescole-optimized-write-fabric.json, content/sources/milescole-table-compaction.json
