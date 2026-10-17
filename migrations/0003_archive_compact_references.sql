-- Compact exact reference index: one write per chunk, irrespective of its
-- number of identifiers or clauses. Existing normalized rows remain readable
-- by the retrieval fallback until their chunks are reindexed.
CREATE TABLE IF NOT EXISTS archive_chunk_search (
  chunk_id TEXT PRIMARY KEY,
  identifiers_json TEXT NOT NULL CHECK (json_valid(identifiers_json)),
  clauses_json TEXT NOT NULL CHECK (json_valid(clauses_json)),
  FOREIGN KEY (chunk_id) REFERENCES archive_chunks(id) ON DELETE CASCADE
);

-- A token-level inverted index narrows candidates before JSON exact-match
-- verification. The JSON remains the authoritative identifier/label evidence.
CREATE VIRTUAL TABLE IF NOT EXISTS archive_chunk_search_fts
USING fts5(identifier_keys, detail=none, columnsize=0, tokenize='unicode61');
