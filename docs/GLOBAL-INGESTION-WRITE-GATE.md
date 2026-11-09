# Global archive write admission gate — safety and rollout

## Scope (this PR)
A shared opt-in lease preflight applies to every authenticated archive-mutating
request in the existing Production code:
- `POST /api/drive-ingest-batch` — deletes, Evidence indexing, RAW upsert.
- `POST /api/document-map-ingest` — document-map analysis/upsert.

It revalidates the root-level coordinator job key, owner, fencing generation
and active lease against D1 immediately before each externally visible
write boundary, and rejects stale/expired/missing/wrong-root owners.
Validation happens again after long/paid embedding operations and between
the two separate Vectorize bindings.

## IMPORTANT limits
**The gate does not make Vectorize mutations atomic with D1.**
The lease can expire between the preflight query and the external Vectorize
write. Rechecking after the write catches loss but cannot reverse a completed
side effect. Thus the feature must remain DISABLED until an additional
generation-qualified staged-publication protocol prevents stale writes
from becoming visible.

Current opt-in flag `INGESTION_GLOBAL_WRITE_GATE_ENABLED` is absent in
Production and not introduced in the default wrangler config. If it is
enabled without both `INGESTION_COORDINATOR_ENABLED=true` and
`INGESTION_COORDINATOR_JOB_KEY=drive:<approved-root-id>`, the gate denies
all authenticated archive mutations (except read-only status requests)
instead of silently bypassing the coordinator.

The existing serial scheduled ingest, bounded two-process canary, and
answering website are unchanged when the flag is absent.

## Validated
- Two independent SQLite connections using same D1-compatible schema.
- All four action families share the same gate; absent claim, wrong Drive
  scope, expired generation, replaced generation, DB unavailable, incomplete
  coordinator config -> explicit safe denial.
- Existing no-flag route behavior remains unchanged.
- TypeScript and full incremental-ingestion tests run before PR.
- GitHub Actions QA workflow runs both coordinator + writer-gate test.

## Remaining activation gates
1. Require the GitHub indexer to **claim** the root lease before work,
   renew it throughout Drive/PDF/Gemini operations, and attach its
   identity to every mutating request; fail closed if renewal fails.
2. Make D1 durable versioned checkpoint authoritative and migrate from the
   latest exact serial GitHub checkpoint only after validated backup/restore,
   fingerprint and publication integrity reconciliation.
3. Add generation-qualified immutable Vectorize IDs/receipts, atomic
   D1 CAS publication, and versioned visibility for Evidence, RAW and Map
   (not only preflight). Resolve PR63 draft / external TOCTOU gap.
4. Verify a stale worker after takeover cannot publish evidence, change
   published vectors, or delete another generation, even if its network
   request returns late. Rehearse crash and rollback in isolated D1 +
   Vectorize before any Production schema/flag deployment.
5. Only then schedule two independent Production jobs with aggregate paid
   API budget and monitoring. Do not confuse a passing two-process canary
   inside one GitHub Actions job with durable independent workers.

Do not add secrets, confidential Drive paths, document text, service-account
JSON, JWTs or unredacted upstream responses to GitHub issues or test logs.
