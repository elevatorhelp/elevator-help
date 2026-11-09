# Drive indexer: optional root lease and D1-authoritative checkpoint

Status: prepared + offline tests only. **Not enabled in Production.**
Existing single scheduled indexer and bounded two-process canary retain
their original checkpoint and request behavior when the mode is absent.

## Opt-in execution guard
The real `scripts/drive-ingest.mjs` only enters D1 ownership mode when
`INGESTION_D1_COORDINATOR_MODE=strict`. In that mode it additionally
requires:
- GitHub Actions **manual** workflow_dispatch, exact
  `INGESTION_D1_EXPLICIT_RUN_ID=GITHUB_RUN_ID`, no shard assignment,
  no forced reindex, no target file.
- A real restored GitHub checkpoint with >=100 per-document records for
  the approved root, version 3, no parallel-shard marker.
- A private authenticated `/api/ingestion-coordinator` endpoint already
  deployed and explicitly configured with its D1 coordinator schema and
  exact approved Drive root; it remains disabled today.
- The first D1 write additionally requires
  `INGESTION_D1_BOOTSTRAP_APPROVED=true`. Subsequent runs restore the
  D1 checkpoint as source-of-truth (even if cached local state differs).
  Any missing or corrupted state fails closed; never reindex all files.

One root-wide D1 lease is acquired before any archive mutation; the
process renews it every 45s with 180s TTL. Loss of lease stops further
mutating requests/checkpoints. Every mutating HTTP payload carries the
same `globalArchiveLease` identity for the route's D1 gate.
After each bounded phase, D1 checkpoint CAS is persisted *before* the
local atomic GitHub checkpoint file. On normal exit, release ownership.
A crashed process eventually loses its lease, the next approved run
restores the last durable D1 state and can resume.

## Tested offline
- Concurrent owner claim denied; first bootstrap denied unless approved.
- D1 CAS version increments, exact existing checkpoint recovered on
  owner change even if local Github cache is outdated.
- Heartbeat denial marks lease lost and blocks both mutation and writes.
- Existing incremental recovery/plan/budget regressions remain unchanged.
- No secrets/metadata/Drive paths appear in test output.

## Remaining mandatory gates before any enablement
1. **No Production D1 migration yet**. First take a D1 backup and prove
   restore from real serial checkpoint in isolated environment. The
   coordinator endpoint must be deployed with explicit owner approval.
2. **DO NOT ENABLE THIS CLIENT WITH LEGACY MUTATING ROUTES.** Existing
   D1 lease preflights are not atomic with external Vectorize upsert/delete
   and could still allow stale writes. Replace ALL live writer effects by
   immutable generation stage/receipt/CAS publication and hard-deletion
   tombstones. Ensure all user-facing readers enforce published generation.
3. The current V2 physical staging generation is tied to global lease
   generation; a multi-run document needs a *stable document staging epoch*
   independent of the job lease. Implement before enabling.
4. Root-wide lease permits ONE owner; the old two-OS-process bounded
   canary can share it only with explicit parent transfer/coordination.
   Two independently scheduled workers require safe per-shard ownership
   and exact file-ID partition. Do not claim this PR enables them.
5. Add a single global paid Gemini calls budget and verified true
   Cloudflare dual-Vectorize readback/rollback, then owner-approved
   bounded live rollout.

No new schedule, Cloudflare secret, feature flag, or Production deployment
is performed by this code change.
