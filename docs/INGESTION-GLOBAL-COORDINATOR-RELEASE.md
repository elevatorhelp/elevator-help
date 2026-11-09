# Elevator Help: Global Archive Coordinator — release controls

**Current status: QA-only implementation. NOT enabled on Production.**
Do not interpret a green lease/checkpoint test as approval for unbounded
concurrent live ingestion. This code is infrastructure-independent and
does not route by standard, supplier, model or language.

## What is implemented
- **Single exclusive root-level archive lease**, shared across serial and
  dual worker modes, with atomic claim, expiry, renewal, release and monotonically
  increasing *fencing generation* on owner takeover.
- **D1 durable checkpoint record**, revisioned by compare-and-swap (CAS).
  Each checkpoint write requires a currently active matching job/owner/
  generation **in the same SQL statement as the checkpoint mutation**.
- Exact SHA-256 content-integrity verification on restore and a hard 1.25 MB
  per-checkpoint payload bound. Invalid or corrupt data fails closed.
- Private authenticated coordinator endpoint
  `POST /api/ingestion-coordinator`, disabled unless
  `INGESTION_COORDINATOR_ENABLED=true` AND an explicit
  `INGESTION_COORDINATOR_JOB_KEY=drive:<approved-root-id>` exist.
  The existing `INGESTION_TOKEN` is required, and errors do not emit SQL
  statements, raw Drive paths, document data or credentials.
- Compatible SQLite and D1 schema in
  `docs/ingestion-global-coordinator-schema.sql`.
- No new schedules; no change to current ingestion Worker API, the
  existing 4 daily serial GitHub runs, or live Cloudflare Worker bindings.

## Verified (2026-11-09)
- Two separate SQLite database connections compete for the same job.
  Only one winner; contender denied.
- Expiration and renewal; old generation cannot renew/release or CAS-write
  after a new owner takes over.
- New owner restores previously published checkpoint, updates it with
  increasing version, and rejects stale/replayed revisions.
- Checksum tampering and invalid state rejected.
- **QA-only Cloudflare D1** database
  `elevator-help-coordinator-qa-20261024-c6024b2c`: applied additive
  schema, then verified both new tables exist. Production D1 remains
  untouched.
- TypeScript noEmit and offline safety QA pass locally; GitHub CI should
  additionally confirm exact PR head before any merge.

## Remaining gates before real permanent dual Production Workers
1. Connect *all* existing archive writer entrypoints (Evidence, RAW,
   Map, deletes, publish) to a single actual coordinator ownership identity.
   The runtime must renew ownership throughout expensive external operations,
   stop on loss, and checkpoint after each bounded action.
2. **Close the external Vectorize race**: a D1 preflight is NOT atomic with
   remote vector writes. Require generation-qualified immutable vector IDs,
   read-back receipts, conditional D1 publication with the same current lease,
   and versioned Evidence/Map visibility. Do not expose incomplete or stale
   generations to retrieval. Coordinate with PR #63; do not merge its
   incomplete staged-publication path blindly.
3. Migrate current serial checkpoint safely into D1 as the authoritative
   store after verified D1 backup/Time Travel and an isolated restore test.
   Reconcile D1 publication records and Vectorize manifests. GitHub Actions
   cache stays as a bounded rollback copy, not the source of truth.
4. Enforce aggregate Gemini budget across two independent OS/Actions jobs,
   separate disjoint per-file claims, monotonic heartbeat and explicit
   2-worker monitoring, stale-worker/crash simulation and rollback.
5. Stage on a disposable D1/Vectorize pair, then owner-authorized production
   canary; only afterward enable recurring two-worker jobs. Do not disable
   the existing serial schedule until the transition is proven.

## Security
Production never receives the coordinator migration or feature flags from
this PR. Never print snapshot JSON, source filenames, tokens, Google service
account JSON or session cookies to GitHub logs or the public Roadmap.
