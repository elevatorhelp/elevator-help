-- Repair schema drift: migration 0003 was recorded but this virtual table
-- is absent from the current production schema. Safe and idempotent.
CREATE VIRTUAL TABLE IF NOT EXISTS archive_chunk_search_fts
USING fts5(identifier_keys, detail=none, columnsize=0, tokenize='unicode61');
