CREATE TABLE IF NOT EXISTS archive_chunks (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content_type TEXT,
  source_fingerprint TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS archive_chunks_source_file
  ON archive_chunks(source_file_id, page, chunk_index);

CREATE TABLE IF NOT EXISTS archive_chunk_identifiers (
  chunk_id TEXT NOT NULL,
  identifier_key TEXT NOT NULL,
  identifier_label TEXT NOT NULL,
  PRIMARY KEY (chunk_id, identifier_key),
  FOREIGN KEY (chunk_id) REFERENCES archive_chunks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS archive_chunk_identifiers_lookup
  ON archive_chunk_identifiers(identifier_key, chunk_id);

CREATE TABLE IF NOT EXISTS archive_chunk_clauses (
  chunk_id TEXT NOT NULL,
  clause_key TEXT NOT NULL,
  PRIMARY KEY (chunk_id, clause_key),
  FOREIGN KEY (chunk_id) REFERENCES archive_chunks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS archive_chunk_clauses_lookup
  ON archive_chunk_clauses(clause_key, chunk_id);
