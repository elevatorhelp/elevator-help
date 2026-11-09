-- QA / opt-in only. Do not apply to Production before backup+restore.
-- A staged vector is invisible until a same-lease, exact-manifest D1 commit.
CREATE TABLE IF NOT EXISTS ingestion_v2_vector_receipts (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 layer TEXT NOT NULL CHECK(layer IN ('raw','map')),
 logical_id TEXT NOT NULL,
 staged_id TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,generation,layer,logical_id),
 UNIQUE(staged_id)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_receipts
 ON ingestion_v2_vector_receipts(document_id,generation,layer);
CREATE TABLE IF NOT EXISTS ingestion_v2_staged_evidence (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 logical_id TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 text TEXT NOT NULL,
 file_name TEXT NOT NULL,
 source_path TEXT NOT NULL,
 page INTEGER NOT NULL CHECK(page>0),
 chunk_index INTEGER NOT NULL CHECK(chunk_index>=0),
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,generation,logical_id)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_evidence
 ON ingestion_v2_staged_evidence(document_id,generation);
CREATE TABLE IF NOT EXISTS ingestion_v2_publications (
 document_id TEXT PRIMARY KEY,
 job_key TEXT NOT NULL,
 active_generation INTEGER NOT NULL CHECK(active_generation>=1),
 source_fingerprint TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL,
 raw_count INTEGER NOT NULL CHECK(raw_count>0),
 evidence_count INTEGER NOT NULL CHECK(evidence_count>0),
 map_count INTEGER NOT NULL CHECK(map_count>0),
 published_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_published_job
 ON ingestion_v2_publications(job_key,active_generation);
