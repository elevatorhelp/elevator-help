# Private immutable archive publication endpoint

**Not enabled in Production; no deployment, migration or live ingestion.**

## Endpoint contract
`POST /api/immutable-archive-publish` authenticates with the **existing**
`INGESTION_TOKEN` and requires all of:
- `INGESTION_IMMUTABLE_PUBLICATION_ENABLED=true`
- `INGESTION_COORDINATOR_ENABLED=true`
- `INGESTION_COORDINATOR_JOB_KEY=drive:<approved-drive-root>`
- D1 `CORTEX_DB` and both Vectorize bindings.

The caller must provide a valid `globalArchiveLease` returned by the
root D1 Coordinator. The endpoint forces the global lease guard ON,
regardless of any separate legacy route flag. Every mutation revalidates
owner, job key, generation and current expiry and fails closed.

Actions:
- `stage_vector`: one RAW/Map logical chunk with distinct legacy/multilingual
  embedding vectors and exact source/page metadata. Writes generation-qualified
  physical IDs using `insert()`, checks both `getByIds()`, then commits an
  immutable D1 receipt only if the same lease generation still owns the root.
- `stage_evidence`: writes exact source text/page into a generation-qualified
  D1 staging row, immutable to retries.
- `publish`: atomic D1 CAS switches document generation only when complete,
  exact source-fingerprint-consistent RAW/Evidence/Map manifests and the
  same active root lease are present.

No raw source text, Google Drive paths, bearer values or SQL failure bodies
are returned in errors. Request is bounded; disabled feature returns 404.

## Critical blockers before enabling this endpoint
**Do not turn on the feature flags yet.** The existing public retrieval
paths have NOT all been switched to the published-generation read filter,
and the current serial scheduled indexer still writes unversioned vectors
through old endpoints. A partly staged vector could otherwise be returned
by legacy semantic search prior to publication.

Before activation, integrate ALL read routes (direct Vectorize query,
document-map planning, standards exact clause, direct getByIds and
archive_chunks exact Evidence) with generation visibility and fail-closed
D1 errors; route all writers/deletes through immutable versioned operations,
attach real runner lease heartbeat, restore authoritative D1 checkpoint,
verify Cloudflare Vectorize asynchronous readback in isolated QA, and
rehearse recovery/rollback with the original archive intact.

No Production D1 schema changes, Cloudflare flags, Gemini charges or new
parallel schedules are introduced by this PR.
