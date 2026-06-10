# Ingestion queue

One source per line: `<url> tier=<1-6>` (tier optional — the curator infers it from the
domain if omitted). Lines starting with `#` are comments. Run `/ingest-batch` to process;
processed lines are moved to the Done section below with the resulting content file.

## Queued

# blog INDEX pages — curator picks the most substantive recent Fabric posts and
# ingests each post as its own source
https://bradcoles-dev.github.io/index.html#blog tier=4
https://milescole.dev/categories/ tier=4

## Done
