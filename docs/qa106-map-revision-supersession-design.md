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

## Generic activation contract preview — offline only

A separate additive **generic schema**, `docs/qa106-generic-map-revision-preview-schema.sql`,
models `ingestion_v2_map_revision_candidates`,
`ingestion_v2_map_revision_receipts` and
`ingestion_v2_map_revision_activations` WITHOUT altering
`ingestion_v2_publications`. It has not been applied to any remote database.

`scripts/qa-issue106-generic-map-publication-preview.ts` shows the
proposed all-layer publication **contract**, NOT a deployed implementation:

- One D1 candidate stores the complete SHA-attested text, source, logical IDs
  and revision-bound physical IDs. A candidate is itself an immutable
  **deny-old-fallback marker**, even if no active pointer exists.
- A current fenced writer claims exact source epoch/fingerprint and confirms
  both index copies and the revision's exact receipt set. It atomically
  activates a single pointer only if the same statement sees the current
  owner lease, staging epoch, new Map receipt IDs, and the exact old RAW and
  Evidence ID sets. Previous incomplete Map receipts are *not* included.
- The current model-generated Map text is content-addressed again from its
  original pre-staging metadata; neither fabricated new IDs nor a mismatched
  physical vector may be activated.
- A version-aware **read-side proof** checks the active pointer and all
  revised Map physical pairs in both indexes; it gates B RAW visibility on
  the same pointer and exact RAW receipt + dual-index metadata; exact
  Evidence citations are read from that epoch under the same activation.
  Existing A immutable publications without any candidate still use the
  legacy D1 publication + receipts. Unpublished, blocked, source-changed,
  index-missing, malformed or changed-receipt B maps/RAW/Evidence fail closed.
- Rolling back the pointer sets `state='blocked'` under the current lease
  and epoch, without deleting any old or new vector or D1 receipt. Because
  the durable candidate remains, **no legacy Map fallback is possible**.
  Reattesting the exact same complete revision can restore the pointer with
  zero new model/embedding requests.
- The proof is exercised only with **synthetic local SQLite and fake index
  readers**. It does not call `publishedArchiveEnv`, `/api/ask`, the
  production `filterVisibleImmutableVectors` call sites, remote D1,
  Cloudflare Vectorize, or Gemini. No flag is turned on.

**Important limitations / review before live:** A real migration must make
all Vectorize query and getByIds paths AND evidence/legacy search paths use
one reviewed revision-aware reader behind a default-off release gate.
Reader/activation CAS must be validated against source revisions during
concurrent updates, not merely single-threaded SQLite. A production-grade
schema migration and explicit backfill strategy for already published A
and other legacy documents are still needed. Verify actual Cloudflare D1
query/transaction behavior and Vectorize eventual consistency, and
complete a backup/restore drill. The preview reads whole-document Map
pairs for assurance and should be optimized without weakening safety
before enabling the user-facing service. D1 retention/access policy for
cached exact model output and embeddings needs an IP/security review.

## Migration, restore and feature-flag rehearsal (2026-11-22, LOCAL ONLY)

The new `scripts/test-issue106-map-migration-restore.ts` exercises a
**local temporary SQLite** D1-like database with a previously published
synthetic A, B's one old unfinished Map receipt/pending window, 2 RAW
receipts, 2 Evidence records and one durable checkpoint.

1. Apply the existing coordinator/epoch/evidence/receipt/pending schema,
   seed the synthetic source-fingerprinted records, and verify SQLite
   integrity + foreign keys.
2. Use SQLite `VACUUM INTO` to create a **pre-migration backup** and
   verify its baseline rows/DDL.
3. Run both additive revision-preview SQL schemas **twice** to verify
   idempotency; assert the old table DDL and all seven existing table
   contents are unchanged, verify that orphan revision receipts cannot be
   inserted, and ensure no legacy B publication is silently manufactured.
4. Insert only a **blocked** synthetic candidate/pointer and verify the
   published A, RAW/Evidence B and old incomplete Map stay unchanged.
5. Restore the pre-migration file to a second isolated SQLite DB; assert
   the exact old tables/rows, B Map incompleteness, A publication,
   integrity and foreign keys. No external mutations or model API calls.

**This is NOT a Cloudflare D1 remote backup/export/restore**, which still
requires a separate authorized QA run and rollback review. Additive
migration cannot be rolled back on real D1 by blindly dropping tables
that may have acquired live rows; production rollback is **blocking the
active revision pointer and switching off the read flag** under an
explicit change-control plan, with a verified backup before migration.

The new `scripts/qa-issue106-revision-reader-flag-preview.ts` is an
**offline-only** three-path adapter for `query`, `getByIds`, and
`readExactEvidence`. The optional
`INGESTION_MAP_REVISION_READS_PREVIEW_ENABLED` flag defaults to off
and returns the original environment object **unchanged**. In opt-in
simulation it requires D1 + both indexes and calls the generic
revision-aware Map/RAW/Evidence proof; a missing binding, query
failure, blocked pointer or stale source yields **no matches**.
The test proves the flag cannot leak the original B unfinished Map
while still allowing legacy published A. This adapter is **NOT
imported by** `publishedArchiveEnv`, `/api/ask`, or any deployed Worker.
Do not set this flag in a real environment before all reader
integrations and security review.

**Integration hazard identified and guarded in this unmerged branch:**
the existing `app/lib/archive-evidence-index.ts` checks only
`ingestion_v2_publications` when filtering legacy exact Evidence;
B with a revision candidate but without an old publication could
otherwise be treated as an unsuperseded legacy document. The branch
now adds a separately opt-in **`__mapRevisionReadGate`** check:
the existence of *any* revision candidate denies legacy Evidence
fallback for that document, including before activation or after
a blocked rollback. If the revision table or D1 read fails, the
candidate check fails closed. This marker is **never set** by the
production app and changes nothing without explicit future migration
wiring. Offline `scripts/test-issue106-legacy-evidence-gate.ts`
covers the existing default mode, published A, incomplete B, cached
document lookups and missing D1 schema. Future production integration
must additionally replace the exact Evidence discovery path with
revision-aware active-pointer citations; hiding old B rows alone is
**not** sufficient to show B's revised citations safely. **Do not enable
any real revision-read feature flag before that integration passes
separate QA and release review.**

## Application integration under a second default-OFF flag (review only)

The generic revision implementation now lives once in
`app/lib/ingestion-map-revision-visibility.ts`; the old test script re-exports
the same core, avoiding divergence between the tested SQL and the app copy.
**No D1 migration is deployed**, and no environment currently has the new
feature flag set.

`app/lib/ingestion-published-reader.ts` has a SECOND optional gate,
`INGESTION_MAP_REVISION_READS_ENABLED`. Both that flag **and**
`INGESTION_PUBLISHED_READS_ENABLED` must explicitly be `true` to allow
version-aware Map/RAW results; if only revision flag is set, all archived
Vectorize results are denied. With both OFF, the original env object is
returned unchanged. With only existing published reads enabled, the existing
legacy immutable D1 reader remains the default. With both flags enabled,
`query` and `getByIds` require BOTH original Vectorize indexes and
the precise active D1 Map revision; no partial Map/RAW or legacy Map fallback
is allowed for a document with a pending candidate.

The D1 wrapper exposes `__mapRevisionReadGate` and the original pair of
readback indexes only when the revision gate is enabled. This enables:
- `app/lib/archive-evidence-index.ts` to suppress **all** legacy Evidence
  (and previously published old-epoch Evidence) for any revision-candidate
  document, including before Map activation or after pointer rollback;
- `app/lib/ingestion-map-revision-evidence.ts` to search bounded exact
  identifier/clause terms, then reattest every candidate's complete
  active Map and exact unchanged source-page Evidence from D1 and both
  Vectorize indexes before surfacing any citation;
- published legacy A evidence to retain the older immutable semantics
  if no revision candidate exists.

No flag is configured in `wrangler*`, GitHub Actions or Production.
This additional code does **not** stage a real B replacement Map, apply
a migration, start the remote ingestion runner, or activate a new
publication; PR #125 remains Draft and unmerged.

**Review blockers before enabling either gate remotely:** performance of
full-document dual-index readback on every query; D1 eventual consistency
under concurrent lease and epoch flips; rollback across a partially failed
multi-index write; exact synthetic and real source citation verification;
fresh protected backup and restoration drill on QA D1; customer-protected
model text/embedding retention policy; auth and cross-tenant separation;
bounded spending for any future B regeneration; independent approval of the
feature flag and staged rollout. A green offline test alone does not
authorize this release.

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


## Verified remote Cloudflare scratch backup/restore rehearsal (2026-11-22)

**Real isolated QA infra tested; this is not a live B Map repair.**
[GitHub Actions #45055404560](https://github.com/elevatorhelp/elevator-help/actions/runs/45055404560)
ran the one-shot `scripts/qa-issue106-remote-backup-restore.sh` on PR #125
branch head `6b748443a0587bee7d1fffe915fa059ee0109de4`.

- Checked exact configured QA D1 UUID `02716877-15e3-4478-9e24-f1ba6e5dfb00` and
  two staging-only Vectorize index bindings; this prevents a Production D1
  or Vectorize binding from being selected by the rehearsal.
- Source **QA** D1 was queried **read-only**, proving one published A,
  unpublished B, one incomplete B Map receipt, two B RAW receipts,
  two exact B Evidence entries and no active QA worker leases.
- Exported the actual remote QA D1 to a private temporary CI file.
  Restored locally to SQLite, with an integrity check; no DB SQL or source
  content was logged or uploaded as a CI artifact.
- Created a **disposable remote EU-jurisdiction D1**, imported the actual
  QA export there, and compared exact A/B row counts against the source.
- Applied both additive revision schemas **twice** to the disposable
  remote D1 to verify idempotency; A/B historical row counts remained intact.
- Rechecked the source QA D1 unchanged and successfully **deleted the
  disposable remote DB**. Sanitized PASS markers from the run include
  `QA106_REAL_REMOTE_D1_RESTORE`,
  `QA106_REMOTE_RESTORE_ADDITIVE_MIGRATION_TWICE`,
  `QA106_SOURCE_QA_UNCHANGED_NO_GEMINI_NO_PRODUCTION` and
  `QA106_SCRATCH_D1_DELETED`.
- Entire exact-head branch CI also passed Build, offline Issue106, published
  reader and exact Evidence QA after this addition.

**Still not done:** neither additive schema was applied to the ORIGINAL QA
database; its remote Time Travel bookmark/restore under an actual failed
migration has not been tested. No B generated replacement Map was staged in
actual D1/Vectorize; no real active revision pointer or QA readers were
enabled. No Cloudflare production database, config, API or Worker was
changed; no Gemini/Workers AI model calls occurred.

**Next guarded engineering gate:** QA-only B new-revision runtime behind a
default-OFF flag, with irreversible per-document model-call reservation
before any external provider request, persisted exact payload/dual embeddings,
strict no-auto-paid-retry, and original-old-receipt preservation. Review the
D1 retention/IP policy and independent source/lease fencing before migrating
the source QA D1 or running billed regeneration. The old paid exact-ID
workflow is permanently unsuitable for this scenario.

## Current stage: bounded QA shadow writer code behind OFF flag (2026-11-22)

A new B-only route action `stage_qa106_shadow_map_b_v2` is present in
`app/api/document-map-ingest/route.ts` **only on Draft PR #125**.

- Requires an ingestion authorization token, a valid D1 owner lease,
  document ID for the reviewed synthetic QA PDF B, the dedicated QA job,
  `QA106_ISOLATED_BINDINGS=qa106-pr100-v2-only`,
  `QA106_B_MAP_REVISION_SHADOW_ENABLED=true`, and the exact bounded
  `GEMINI_MAX_CALLS_PER_INGEST_REQUEST=2`.
- These flags are **OFF** in the committed QA Wrangler configuration and
  absent from Production. No running QA Worker is enabled.
- Reads the original unchanged pending Map window, retains the original
  receipts, and creates a separate B revision with one generation attempt,
  one Workers AI embedding and one Gemini embedding batch, each D1-reserved
  before invoking its provider. The pipeline checkpoints generated Map
  text and both embedding arrays before dual Vectorize insertion.
- A failure with uncertain provider outcome **never auto-retries that call**.
  A completed durable embedding phase can be re-attested without providers.
- Returns a SHADOW status only. Does not update the real publication table,
  enable QA /api/ask, or start two Worker processes.
- The QA-only provider-orchestration entrypoint is additionally covered by
  offline SQLite + fake-index regressions; a real source-grounded paid run
  remains separately gated.

The next remote **disposable** D1 rehearsal will include the newly added
`qa106_map_revision_provider_reservations` table as well as both original
additive schemas. No real model invocation, no original QA schema migration,
no live app deployment and no Production change are authorized by that
rehearsal.
