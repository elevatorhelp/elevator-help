-- QA-only proposal. Do NOT apply to the production D1 until tested migration and restore.
-- Receipts and source rows are generation-qualified and never rewrite active evidence.
CREATE TABLE IF NOT EXISTS ingestion_staged_evidence (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 chunk_id TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 text TEXT NOT NULL,
 file_name TEXT NOT NULL,
 source_path TEXT NOT NULL,
 page INTEGER NOT NULL,
 chunk_index INTEGER NOT NULL,
 identifiers_json TEXT NOT NULL,
 clauses_json TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,generation,chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_staged_evidence_gen
 ON ingestion_staged_evidence(document_id,generation);
CREATE TABLE IF NOT EXISTS ingestion_staged_map_receipts (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 chunk_id TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,generation,chunk_id)
);
