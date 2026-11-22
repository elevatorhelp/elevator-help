# Issue #106 — B-only Map revision supersession (QA/offline design, 2026-11-22)

**Stage:** prototype / offline test only. **No Production schema migration, no
API/CLI route registration, no Gemini or Workers AI requests, no remote D1 writes,
no Vectorize writes, no release.**

## Root cause

The current V2 `ingestion_v2_vector_receipts` has a PK
`(document_id, generation, layer, logical_id)`. Publication compares **all**
receipts for one `generation` to an exact three-layer manifest. In the isolated
QA test, document B has two RAW and Evidence receipts, and an incomplete
two-node original Map with one valid receipt; its second physical ID is absent
from BOTH Vectorize indexes. The original Gemini text was not durably retained.
The content-derived original Map ID cannot be reconstructed, as demonstrated
by the bounded failed `QA106_B_REPAIR_REGENERATION_MISMATCH` run.

Reusing the source epoch and appending a different Map in the **legacy receipt
table** would mix obsolete and new Map receipts in one publication scope.
Advancing the **document staging epoch** would force a new RAW/Evidence
generation or break exact per-epoch publication. Overwriting old D1 receipts,
inventing the missing hashed content, or resetting PDF A is unacceptable.

## Model

A Map *revision* is **independent of both the document source epoch and the
short-lived worker lease generation**:

- source document epoch and fingerprint remain constant for B's unchanged PDF;
- `revision=1` is a new replacement Map, rather than a rewrite of the old
  incomplete pending Map window; the old window and receipt remain intact;
- stable logical IDs include the new revision and the **exact** new model text
  and source metadata; physical IDs use the existing generation-qualified
  `immutableVectorId`. Only the new revision's Map IDs are accepted.
- an additive, **QA-only** table family records the revision state
  (`planned -> generated -> embedded`), exact new text/metadata/IDs,
  both embedding arrays, Map receipts and a separate shadow publication;
- source text and vectors are sensitive: never log payloads, prompts, full
  metadata, vector IDs or credentials. The prototype stores exact generated
  model content in ephemeral local test SQLite; a real rollout must review
  D1 access, retention, deletion and customer-IP segregation.

## Fail-closed lifecycle

1. **Begin**: under a live D1 lease and matching document epoch/fingerprint,
   require B scope, published A, unpublished B, one old B pending window, one
   historical old B Map receipt, two RAW and two Evidence entries. Record the
   new revision in one CAS; do not mutate old records or call Gemini.
2. **Durable generated payload**: after an externally approved, capped model
   call (not implemented in this prototype), store the complete source-grounded
   node text, metadata, revised IDs and SHA in one D1 CAS. A successor worker
   reads this payload and MUST NOT call the generation model again.
3. **Durable embeddings**: persist both legacy and multilingual vector values
   in one D1 CAS before any physical Vectorize insert. Before this step,
   embedding generation may still be required, but not Map generation; after
   it, **neither provider call** is needed for retries.
4. **Stage/attest**: with the current lease and unchanged source epoch, inspect
   both physical indexes before inserting. Two matching physical records are
   reused without insertion; two absent records can be inserted from the
   durable embedding payload (using `insert`, never `upsert`). A one-index
   pair or inconsistent metadata fails closed. A dual-index readback precedes
   a separate **revision-scoped** D1 receipt CAS. A crash after both remote
   inserts but before D1 receipt is model-free to recover.
5. **Shadow publication**: reattest all vectors and require EXACT revision
   receipt IDs plus intact RAW/Evidence counts inside one D1 CAS under a valid
   lease+source epoch. The row is inserted **only** into
   `qa106_map_revision_shadow_publications`; this is NOT a live archive
   publication and has NO effect on the existing `/api/ask` search readers.
6. **Stale ownership / source change**: D1 mutation checks the current lease
   owner+generation and source epoch+fingerprint in the same statement. Old
   physical vectors might finish inserting after expiry but remain invisible
   (there is no real publication). A new source epoch rejects old revision
   mutations.
7. **Partial remote index failure**: never insert into the other index by
   blindly repeating without reconciliation; a half-pair fails closed for
   separate diagnostic handling. Historical receipts are never deleted.
8. **Atomic active-revision reader (offline proof only)**: the new
   `filterShadowVisibleMapVectors` accepts candidates only when ONE D1 shadow
   publication row matches the unchanged source epoch, B job, revision payload
   and exact manifest SHA. It requires the complete revision-specific D1
   receipt set, unchanged RAW/Evidence counts, and validates *every* new Map
   physical ID against BOTH indexes and original durable text/metadata before
   allowing *any* Map hit. Legacy old B Map receipt alone never makes a node
   visible. No legacy fallback on a missing pointer, wrong metadata, index
   outage or D1 error. This is NOT connected to the production `/api/ask`
   route or current immutable reader.
9. **Pointer rollback drill (offline)**: delete only the shadow active pointer
   in synthetic SQLite; all new Map hits vanish at once while payload/embeddings,
   revision receipts and historical old Map evidence survive. Reattest the
   unchanged vectors with the live lease and atomically republish exactly the
   same shadow manifest with *zero provider calls*.


## What this PR proves and does NOT prove

- Offline SQLite/D1-SQL and fake dual-Vectorize integration tests for the
  above operations; no model or remote resource is needed.
- Active revision read-gate tests prove **zero visible new B Map nodes
  before** the shadow publication CAS; after publication only the exact new
  two nodes are visible. Old unfinished Map, forged revision/fingerprint/page,
  malformed manifest, missing D1 receipt, missing Vectorize mirror, D1
  outage, expired source revision and revoked publication pointer fail closed.
  This is a simulated read path, not a live reader migration.
- The ability to preserve A and old B RAW/Evidence + missing intent and build a
  separate complete, restartable new B Map *shadow* manifest.
- It does **not** prove a real two-worker remote QA pass, an authenticated
  citation test, an actual Production publication, or a recoverable remote D1
  restore.

## Explicit next release gates — all require separate review

- Migrate the generic schema from `qa106_*` to production-grade
  `ingestion_v2_map_*_revision` names with a versioned
  `ingestion_v2_publications` **atomic active Map revision pointer** (or a
  rigorously equivalent atomic D1 publication row). The main reader currently
  filters by source epoch and legacy receipts; without updating ALL reader
  paths to enforce an exact active Map-revision receipt set, legacy incomplete
  B vectors could become visible. A revision shadow row must NEVER be treated
  as a real publication.
- Review D1 migrations (additive), ownership/fencing, schema rollback,
  deduplication and migration of already-published documents to an explicit
  legacy revision; prove old/stale/partial vectors are invisible.
- Extend the route/runner only with an explicit QA B-only feature flag and
  manual-owner confirmation. Enforce a shared total call budget, durable
  write-ahead before external side effects, redacted audit output.
- Run isolated **remote** QA (not production), real D1 export/restore,
  double-index readback, authenticated multi-language source/page citations,
  parallel owner/lease termination and resume, and verify no duplicate
  paid model calls. Before any new paid run, request fresh explicit owner
  approval and a call cap; the failed exact-ID repair must not be rerun.
- Only after Issue #106, #105 and #107 acceptance + owner release go/no-go
  may Production parallel scheduling be enabled.

**Files:** `docs/qa106-map-revision-shadow-schema.sql`,
`scripts/qa-issue106-map-revision-shadow.ts`,
`scripts/qa-issue106-map-revision-shadow-read.ts`,
`scripts/test-issue106-map-revision-shadow.ts`.
