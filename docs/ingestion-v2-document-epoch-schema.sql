-- QA-first durable per-document staging generation.
-- Lease generation identifies the CURRENT WRITER (fencing); staging_epoch
-- identifies a DOCUMENT REVISION and survives ownership changes.
CREATE TABLE IF NOT EXISTS ingestion_v2_document_epochs (
  document_id TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  staging_epoch INTEGER NOT NULL CHECK(staging_epoch BETWEEN 1 AND 9007199254740991),
  source_fingerprint TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_epochs_job
 ON ingestion_v2_document_epochs(job_key,staging_epoch);
