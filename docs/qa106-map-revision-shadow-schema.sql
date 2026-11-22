-- QA-ONLY / OFFLINE LAB SCHEMA for Issue #106: independent Map revisions.
-- DO NOT apply to Production and DO NOT attach to the existing /api/ask path.
-- These additive tables preserve legacy pending Map windows, receipts,
-- RAW/Evidence and publication untouched. Apply only in ephemeral test SQLite.
-- A later reviewed migration must implement safe dual-read rollout and rollback.
CREATE TABLE IF NOT EXISTS qa106_map_revisions (
  document_id TEXT NOT NULL,
  staging_epoch INTEGER NOT NULL CHECK (staging_epoch >= 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  job_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  supersedes_window_key TEXT NOT NULL CHECK (length(supersedes_window_key)=64),
  state TEXT NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned','generated','embedded')),
  payload_json TEXT,
  payload_sha256 TEXT,
  embeddings_json TEXT,
  embeddings_sha256 TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(document_id,staging_epoch,revision),
  CHECK (
    (state='planned' AND payload_json IS NULL AND embeddings_json IS NULL)
    OR
    (state='generated' AND payload_json IS NOT NULL
     AND payload_sha256 IS NOT NULL AND embeddings_json IS NULL)
    OR
    (state='embedded' AND payload_json IS NOT NULL
     AND payload_sha256 IS NOT NULL AND embeddings_json IS NOT NULL
     AND embeddings_sha256 IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_qa106_map_revision_source
  ON qa106_map_revisions(document_id,job_key,staging_epoch,source_fingerprint);

CREATE TABLE IF NOT EXISTS qa106_map_revision_receipts (
  document_id TEXT NOT NULL,
  staging_epoch INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  logical_id TEXT NOT NULL,
  staged_id TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(document_id,staging_epoch,revision,logical_id),
  UNIQUE(staged_id),
  FOREIGN KEY(document_id,staging_epoch,revision)
    REFERENCES qa106_map_revisions(document_id,staging_epoch,revision)
);

-- SHADOW ONLY: a row here is NEVER a production publication. Existing
-- ingestion_v2_publications / readers intentionally remain unchanged.
CREATE TABLE IF NOT EXISTS qa106_map_revision_shadow_publications (
  document_id TEXT PRIMARY KEY,
  staging_epoch INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  job_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  map_count INTEGER NOT NULL CHECK(map_count>0),
  raw_count INTEGER NOT NULL CHECK(raw_count>0),
  evidence_count INTEGER NOT NULL CHECK(evidence_count>0),
  published_at_ms INTEGER NOT NULL,
  FOREIGN KEY(document_id,staging_epoch,revision)
    REFERENCES qa106_map_revisions(document_id,staging_epoch,revision)
);


-- One reservation per external provider step. Reserve in D1 BEFORE the call.
-- An interrupted call with no durable output CANNOT be automatically retried
-- under a successor lease: it would risk duplicate model/embedding spend.
-- A deliberately approved new revision would require separate change control.
CREATE TABLE IF NOT EXISTS qa106_map_revision_provider_reservations (
  document_id TEXT NOT NULL,
  staging_epoch INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN
    ('map_generation','workers_ai_embedding','gemini_embedding')),
  job_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  lease_generation INTEGER NOT NULL CHECK(lease_generation>=1),
  reserved_at_ms INTEGER NOT NULL CHECK(reserved_at_ms>0),
  PRIMARY KEY(document_id,staging_epoch,revision,purpose),
  FOREIGN KEY(document_id,staging_epoch,revision)
    REFERENCES qa106_map_revisions(document_id,staging_epoch,revision)
);
