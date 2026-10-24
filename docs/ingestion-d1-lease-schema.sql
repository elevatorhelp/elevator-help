-- Prototype only: do not apply to production before backup/restore verification.
CREATE TABLE IF NOT EXISTS ingestion_worker_leases (
  job_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  lease_until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
-- Acquire a new job only if no active owner; execute as one atomic D1 statement.
-- Parameters: job_key, owner, now_ms, lease_duration_ms.
-- INSERT INTO ingestion_worker_leases (job_key,owner,generation,lease_until_ms,updated_at_ms)
-- VALUES (?1,?2,1,?3 + ?4,?3)
-- ON CONFLICT(job_key) DO UPDATE SET
-- owner=excluded.owner,
-- generation=ingestion_worker_leases.generation+1,
-- lease_until_ms=excluded.lease_until_ms,
-- updated_at_ms=excluded.updated_at_ms
-- WHERE ingestion_worker_leases.lease_until_ms <= ?3;
-- A zero changes count means another live owner holds the job.
-- Complete/renew MUST check owner, generation and lease_until_ms > now.
