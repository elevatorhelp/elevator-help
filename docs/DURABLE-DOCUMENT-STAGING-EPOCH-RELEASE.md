# Durable per-document staging epoch independent of worker Lease

Status: **QA-only, disabled in Production**. No Production schema or
Cloudflare feature switch is performed by this PR.

## Why this matters
The global D1 root lease generation changes whenever an ingestion Worker
crashes, resumes or transfers ownership. Earlier V2 generation-staged
physical Vectorize IDs used that ephemeral *owner* generation, preventing
a long PDF's partial RAW/Evidence/Map receipts from being completed across
different bounded scheduled jobs. Re-embedding would waste paid calls.

This PR separates **two different identities**:
- The global `ingestion_global_leases.generation` identifies the current
  writer and fences stale network responses.
- The durable `ingestion_v2_document_epochs.staging_epoch` identifies
  an exact source revision and remains constant across lease handovers.
  A new source fingerprint (including any embedding-version identity)
  increments this document's epoch exactly once.

## What is enforced
- A single D1 `INSERT ... ON CONFLICT ... RETURNING` allocates/gets
  the stable document epoch only when the root Lease is current.
- RAW/Map immutable physical IDs, metadata, readback, Evidence source pages,
  terms, receipts and the atomic 3-layer D1 publication use the **document
  staging epoch**, not the short-lived Lease generation.
- Every D1 receipt/Evidence/term write and final publication additionally
  checks that the same document epoch and exact source fingerprint remain
  active, *in the same SQL mutation as the current owner Lease check*.
- A stale worker may finish an external Vectorize insert after a revision
  change, but cannot record a receipt, publish it or make it visible.
  The next eligible owner can resume the earlier valid partial vector and
  Evidence receipts without re-embedding them.
- The PR93 private stage/publish endpoint now obtains the durable epoch
  from D1 per action and passes it through, under its existing mandatory
  private bearer/global Lease and disabled-by-default feature flag.
- Existing QA-only direct function callers remain backward-compatible if
  no override is supplied; the strict private endpoint always supplies it.

## Verification
- Two SQLite connections to one physical database with two distinct root
  Lease generations: RAW/Evidence partial in generation 1; Map finishing
  and D1-published 3-layer manifest in root Lease generation 2, **with the
  same document epoch and identical vector ID**.
- New source fingerprint advances document epoch and denies same-lease
  stale old-document epoch receipts/pages; the last complete generation
  remains visible until new complete publication.
- Source page and generic identifier/clause resolver switches to exact
  new generation after one D1 CAS; stale generation cannot republish.
- Existing immutable publication and source-reference tests remain PASS.
- Additive D1 epoch table was created and checked only on isolated QA
  Cloudflare D1, never the live Production D1.

## Still mandatory before permanent dual Production indexing
1. The current live serial runner still uses legacy unversioned endpoints.
   Integrate *real document paging* with immutable V2 stage_vector,
   stage_evidence and publish, including old deletions and exactly-once
   reconciliation for partial chunks/receipts. Do not enable V2 flags
   on the current production site until all retrieval and writer paths
   are proved source-safe.
2. Global root Lease is single-owner; two genuinely independent
   scheduled writers require per-shard ownership with file-to-shard
   enforcement and a shared aggregate Gemini budget, OR a common
   parent owner supervising two isolated OS processes. A pair of
   independent runs cannot both claim the same root Lease safely.
3. Confirm the complete end-to-end private endpoint using real Cloudflare
   Vectorize dual indexes and isolated D1 with asynchronous getByIds.
   Physical Vectorize insert/readback was independently verified on
   synthetic QA IDs; this does NOT yet validate the full HTTP endpoint.
4. Migrate authoritative D1 checkpoints from a verified serial snapshot
   with backup/restore and rollback; validate real authenticated source
   citation output from uploaded/published PDFs, across languages.

Never put customer PDFs, Drive filenames, private source content, tokens or
service-account JSON into public GitHub logs or issue comments.
