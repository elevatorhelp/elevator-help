-- Isolated migration for staged vector publication. Apply only after review.
CREATE TABLE IF NOT EXISTS ingestion_document_publications (
 document_id TEXT PRIMARY KEY, job_key TEXT NOT NULL,
 active_generation INTEGER NOT NULL DEFAULT 0,
 updated_at_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ingestion_staged_receipts (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 chunk_id TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 source_fingerprint TEXT NOT NULL,
 PRIMARY KEY(document_id,generation,chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_staged_receipts_generation
 ON ingestion_staged_receipts(document_id,generation);
