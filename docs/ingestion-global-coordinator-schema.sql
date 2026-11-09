-- Additive, QA-first D1 coordinator. NOT applied to Production by this PR.
-- One job_key for the ENTIRE Drive root (serial or two-shard mode).
CREATE TABLE IF NOT EXISTS ingestion_global_leases (
  job_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  lease_until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ingestion_worker_checkpoints (
  job_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 1),
  lease_generation INTEGER NOT NULL CHECK (lease_generation >= 1),
  checksum TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
-- The checkpoint is bound to the lease generation that CAS-published it.
-- A stale owner CANNOT update a checkpoint after a newer owner acquires the job.
-- This does NOT make D1 and external Vectorize write effects one transaction.
