-- OFFLINE CONTRACT PREVIEW ONLY, Issue #106.
-- Do NOT apply this file to any remote D1 or production/QA deployment.
-- Generic per-document Map revision extension to the legacy V2 schema.
-- The existing ingestion_v2_publications, receipts and reader paths are not
-- changed. Real release requires a gated, reviewed all-reader migration.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ingestion_v2_map_revision_candidates (
 document_id TEXT NOT NULL,
 staging_epoch INTEGER NOT NULL CHECK(staging_epoch>=1),
 revision INTEGER NOT NULL CHECK(revision>=1),
 job_key TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state='embedded'),
 payload_json TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 embeddings_sha256 TEXT NOT NULL CHECK(length(embeddings_sha256)=64),
 PRIMARY KEY(document_id,staging_epoch,revision)
);
CREATE TABLE IF NOT EXISTS ingestion_v2_map_revision_receipts (
 document_id TEXT NOT NULL,
 staging_epoch INTEGER NOT NULL,
 revision INTEGER NOT NULL,
 logical_id TEXT NOT NULL,
 staged_id TEXT NOT NULL UNIQUE,
 source_fingerprint TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,staging_epoch,revision,logical_id),
 FOREIGN KEY(document_id,staging_epoch,revision)
   REFERENCES ingestion_v2_map_revision_candidates(document_id,staging_epoch,revision)
);
CREATE TABLE IF NOT EXISTS ingestion_v2_map_revision_activations (
 document_id TEXT PRIMARY KEY,
 job_key TEXT NOT NULL,
 staging_epoch INTEGER NOT NULL CHECK(staging_epoch>=1),
 revision INTEGER NOT NULL CHECK(revision>=1),
 source_fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','blocked')),
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
 raw_count INTEGER NOT NULL CHECK(raw_count>0),
 evidence_count INTEGER NOT NULL CHECK(evidence_count>0),
 map_count INTEGER NOT NULL CHECK(map_count>0),
 activated_at_ms INTEGER NOT NULL,
 FOREIGN KEY(document_id,staging_epoch,revision)
   REFERENCES ingestion_v2_map_revision_candidates(document_id,staging_epoch,revision)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_map_revision_activation
 ON ingestion_v2_map_revision_activations(job_key,staging_epoch,revision,state);
-- The candidate is a persistent DENY-FALLBACK marker. If activation is
-- absent or blocked, revision candidates MUST NOT fall back to older legacy
-- Map receipts, even when a previous live generation has been published.
-- A purely legacy-published document without candidates remains compatible.
