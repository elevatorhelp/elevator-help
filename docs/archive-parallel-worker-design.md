# Offline worker lease protocol (Issue #50)

This is an **offline reference model**, not a deployed queue and not a production D1 implementation.
It intentionally performs no Drive, Gemini, Cloudflare, or network calls.

## Job identity and prerequisites

- Idempotency key: `(file_id, source_fingerprint, phase)`; phase is evidence/raw/map.
- Raw requires completed Evidence **for the same fingerprint**; Map requires completed Raw for the same fingerprint.
- Job states: pending, leased, completed, dead. Retries are bounded; a failed phase must not mark its dependent phase complete.
- A claim gets a new monotonically increasing generation (fencing token); expired or stale owner cannot heartbeat or acknowledge.
- A successful completion requires valid owner + generation and an unexpired lease; late acknowledgements are rejected.
- Allow heartbeats only from the current owner. Expired work may be reclaimed; do not run two active claims of the same phase.
- Any changed source fingerprint is a **new job generation**, not an overwrite of old version work.
- Real D1 implementation must make each claim and state transition atomic with conditional SQL and confirm row count; a JavaScript Map is insufficient across Actions runners.
- D1 database storage is not an independent backup. **Restore-test readiness is still unverified**.

## Production gates not met

1. Review exact D1 transaction/conditional-write semantics and account write quota; limit phase transitions and avoid one-row-per-chunk checkpoints if limits prohibit it.
2. Validate state reconciliation with existing `.ingestion-state/drive.json` and production evidence/vector IDs; never perform an automatic full rebuild on cache loss.
3. Verify that side effects to Vectorize/D1 are idempotent **under a lease**, including slow writes after expiry and duplicate completions; a fencing token alone does not make external writes atomic.
4. Confirm safe deletion and version cutover of outdated vectors, respecting exact-evidence citation policy.
5. Run synthetic offline concurrency tests and a controlled dry-run; separately require documented approval for paid ingestion and production D1 changes.
6. Test D1 backup/restore before modifying production state or running parallel writers.
7. Log aggregates only (no private filenames, document text, Drive identifiers, secrets).

No deployment, ingestion, or paid service activation is contained in this prototype.
