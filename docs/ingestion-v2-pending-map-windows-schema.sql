-- Issue #104 / QA-only additive migration: immutable Map intents.
-- Apply ONLY to the isolated QA D1; Production must remain unchanged.
-- Store no source text, Gemini prompts/embeddings, tokens, or user data.
-- Every row is pinned to one document revision, staging epoch, and exact
-- source-page window before the external Vectorize write begins.
CREATE TABLE IF NOT EXISTS ingestion_v2_pending_map_windows (
  document_id TEXT NOT NULL,
  job_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation >= 1),
  source_fingerprint TEXT NOT NULL,
  window_key TEXT NOT NULL CHECK(length(window_key) = 64),
  map_version INTEGER NOT NULL CHECK(map_version >= 1),
  ids_json TEXT NOT NULL CHECK(length(ids_json) > 0 AND length(ids_json) <= 4096),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(document_id,generation,window_key)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_pending_map_source
  ON ingestion_v2_pending_map_windows(document_id,job_key,generation,source_fingerprint);
