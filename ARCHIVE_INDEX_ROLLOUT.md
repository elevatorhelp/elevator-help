# Exact Evidence Index: Controlled Rollout

## Verified baseline (2026-10-18)

- Production D1 has 2,727 archive chunks and 121,132 legacy identifier rows.
- Production schema contains `archive_chunk_search` but does not contain `archive_chunk_search_fts`, although migration 0003 is marked applied.
- A 29,005,274-byte SQL export was restored successfully in an isolated in-memory SQLite database.
- An offline rebuild over all 2,727 original chunks retrieved the archived `EN 81-71 / D.7` evidence with the exact-index query.
- No production backfill or schema mutation has been performed.

## Safety gates

1. Preserve the pre-migration SQL export and its verified restore result.
2. Cloudflare D1 does not support full SQL export of a database with FTS5 virtual tables. Before enabling FTS in production, validate a per-regular-table backup and restore procedure. Keep D1 Time Travel available for short-term rollback.
3. Run CI including generic clause, exact-index and ingestion regression tests.
4. Apply migration 0004 only after backup strategy is validated; confirm FTS table exists.
5. Run `scripts/backfill-compact-index.mjs` in dry-run mode first. Execute only with an explicit matching database ID, in small batches.
6. Check source identity, exact clause, page and evidence quote using real D1 retrieval before any production release.
7. Roll out application code separately, with a known rollback revision. Do not remove legacy tables until all chunks are reindexed and retrieval is verified.

## Known limitation

The offline test proves retrieval of the original archived clause after reindexing; it does not prove that the live answer generator produces a verified citation. Production release remains gated on that end-to-end test.
