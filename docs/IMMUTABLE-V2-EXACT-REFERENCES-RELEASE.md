# Immutable V2 Evidence reference and clause resolver

Status: QA-only code; inactive in Production because
`INGESTION_PUBLISHED_READS_ENABLED` and immutable ingestion remain OFF.

## Implementation
- Every staged Evidence chunk additionally receives bounded normalized
  reference and clause terms **extracted from its actual source text and
  source filename**, via the existing archive-agnostic identifier resolver.
  No EN-specific, supplier-specific or fault-code-specific route.
- Terms are stored in `ingestion_v2_evidence_terms` only while the
  exact active root D1 owner/generation is valid and a same-fingerprint
  staged Evidence row exists. Retries cannot change an immutable term.
- Exact lookup uses term-key equality and optional exact clause,
  joins the page/chunk and the **D1-published matching generation and
  source fingerprint**, with page/identifier evidence returned through
  the existing `searchArchiveEvidenceIndex` used by standards and
  equipment fault-code helpers.
- In strict mode, superseded legacy `archive_chunks` are hidden,
  while newly published V2 Evidence becomes discoverable. D1 read
  failure hides all exact-source rows rather than serving stale citations.
- Feature-off remains legacy-only, unchanged.

## QA
- Real SQLite two-connection test stages exact Evidence + source terms,
  confirms no citation before full RAW/Evidence/Map manifest publication,
  verifies generic EN-shaped reference and exact clause matching,
  demonstrates wrong clause rejection, stale owner exclusion, and
  superseded old generation hidden after new full publication.
- Existing published-reader and immutable-publication QA retained.
- Additive schema applied ONLY on isolated remote Cloudflare QA D1
  `elevator-help-coordinator-qa-20261024-c6024b2c`.

## Remaining before activation of permanent dual indexing
- All real Drive runner page batches must call the immutable staging
  endpoint in place of current unversioned Evidence/RAW/Map upsert/delete.
- The current short-lived root lease generation is not a durable
  per-document staging epoch across multiple scheduled jobs. Reconcile
  partial checkpoint and per-generation receipts before toggling flags.
- Global lease ownership needs explicit parent/child or per-shard model,
  complete D1-authoritative checkpoint migration, and aggregate paid
  Gemini budget. No independent two-worker scheduling until those pass.
- Real isolated Cloudflare dual Vectorize readback and authenticated
  actual PDF citation regression are not yet demonstrated by these
  SQLite simulations; preserve the current Production single worker.

Do not deploy Production D1 migrations/feature flags from this QA PR.
