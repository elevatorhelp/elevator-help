-- QA-only additive lookup index. Do not apply to Production before restore tests.
-- A term is usable ONLY through a same-generation published Evidence row.
CREATE TABLE IF NOT EXISTS ingestion_v2_evidence_terms (
 document_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 logical_id TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('reference','clause')),
 term_key TEXT NOT NULL,
 label TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(document_id,generation,logical_id,kind,term_key)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_v2_evidence_terms
 ON ingestion_v2_evidence_terms(kind,term_key,document_id,generation);
