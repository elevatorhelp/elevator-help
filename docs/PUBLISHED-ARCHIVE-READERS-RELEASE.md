# Immutable publication reader integration — safety gate

Status: code wired to the public answer route but **OFF by default**.
No Production Cloudflare Worker deployment or D1 migration.

## Integration
- One opt-in `INGESTION_PUBLISHED_READS_ENABLED=true` binding wrapper
  applies consistently to legacy and multilingual Vectorize `query`
  and direct `getByIds`, for standards and fault troubleshooting,
  including fast fallback. No individual clause or supplier hardcodes.
- In strict mode every candidate must be checked against D1
  `ingestion_v2_publications`. A published source requires the exact
  active generation and source fingerprint, plus a **D1 receipt for the
  exact physical staged vector ID**, layer and generation.
- Legacy vectors remain eligible only where a source has not been
  migrated to a published immutable generation.
- The same strict mode removes legacy exact Evidence from
  `archive_chunks` after the new immutable generation becomes active.
  This protects cited source pages in the generic and standards path.
- D1 missing/failed: both semantic vectors and exact legacy evidence
  fail closed. With the feature off, existing Production behavior is
  unchanged.
- Tests exercise both physical Vectorize bindings, direct getByIds,
  wrong/missing receipts, superseded old sources, D1 errors and
  feature-off compatibility.

## Remaining blockers to safe activation
1. **New exact Evidence discovery:** `ingestion_v2_staged_evidence`
   currently lacks an indexed normalized identifier/clause resolver,
   so the legacy exact-source lookup does not yet discover published
   V2 Evidence after migration. Add and test archive-agnostic document
   identifier+clause routing to V2 read-only published page rows.
2. All secondary debug/test/internal read routes must be gated or
   disabled before any staged V2 records are written in Production.
3. Wire the actual Drive ingestion worker to root lease claim/heartbeat
   and a D1-authoritative durable checkpoint with verified migration.
4. **Important:** The existing V2 stage generation derives from the
   short-lived global lease generation. A document spanning two serial
   batches needs a stable persisted per-document staging epoch; preserve
   earlier partial receipts across owner lease rotations before enabling.
5. Replace legacy upsert/delete paths with full immutable RAW/Evidence/
   Map staging and manifest completion; ensure every live reader checks
   publication and exact citations remain verified.
6. Cloudflare QA Vectorize physical dual-index E2E, delayed old-writer
   tests, crash/rollback and aggregate paid API budget. Then owner-
   approved Production rollout, not before.

Do not enable reader-only strict mode on Production while V2 writers,
exact resolver and citations are unintegrated: migrated sources would
temporarily disappear from exact citation retrieval.
