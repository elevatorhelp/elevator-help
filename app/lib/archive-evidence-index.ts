import type { ReferenceIdentifier } from "./reference-identifiers.ts";

export type ArchiveEvidenceRow = {
  id: string;
  text: string;
  source_file_id: string;
  file_name: string;
  source_path: string;
  page: number;
  chunk_index: number;
  content_type: string | null;
  source_fingerprint: string | null;
  identifier_labels: string | null;
  matched_identifiers: number;
};

// Prefer the compact index on reindexed chunks; legacy tables continue to
// serve untouched chunks, so a rolling migration cannot lose exact matches.
export async function searchArchiveEvidenceIndex(
  archiveDb: any,
  identifiers: ReferenceIdentifier[],
  clauses: string[] = [],
  limit = 60,
) {
  if (!archiveDb || !identifiers.length) return [] as ArchiveEvidenceRow[];
  const keys = [...new Set(identifiers.map((item) => item.key).filter(Boolean))];
  const clauseKeys = [...new Set(clauses.filter(Boolean))];
  if (!keys.length) return [] as ArchiveEvidenceRow[];
  const slots = keys.map(() => "?").join(", ");
  // Quote each token as an FTS literal. JSON equality remains authoritative.
  // FTS5 detail=none supports individual terms, not quoted multi-token phrases.
  // Use a single searchable term as a prefilter; JSON key equality below is authoritative.
  const ftsExpression = [...new Set(keys.map((key) => key.match(/[\p{L}\p{N}]+/u)?.[0]).filter(Boolean))]
    .map((term) => '"' + term!.replace(/"/g, '""') + '"').join(" OR ");
  const clauseSlots = clauseKeys.map(() => "?").join(", ");
  const compactClause = clauseKeys.length
    ? `AND EXISTS (
      SELECT 1 FROM json_each(s.clauses_json) AS clause
      WHERE clause.value IN (${clauseSlots})
    )`
    : "";
  const legacyClause = clauseKeys.length
    ? `AND EXISTS (
      SELECT 1 FROM archive_chunk_clauses AS cc
      WHERE cc.chunk_id = c.id AND cc.clause_key IN (${clauseSlots})
    )`
    : "";
  const sql = `
    WITH matched AS (
      SELECT c.id AS chunk_id,
        json_extract(j.value, '$.key') AS identifier_key,
        json_extract(j.value, '$.label') AS identifier_label
      FROM archive_chunks AS c
      JOIN archive_chunk_search AS s ON s.chunk_id = c.id
      JOIN json_each(s.identifiers_json) AS j
      WHERE s.rowid IN (
        SELECT rowid FROM archive_chunk_search_fts
        WHERE archive_chunk_search_fts MATCH ?
      )
      AND json_extract(j.value, '$.key') IN (${slots})
      ${compactClause}
      UNION ALL
      SELECT c.id AS chunk_id, i.identifier_key, i.identifier_label
      FROM archive_chunks AS c
      JOIN archive_chunk_identifiers AS i ON i.chunk_id = c.id
      WHERE NOT EXISTS (
        SELECT 1 FROM archive_chunk_search AS s WHERE s.chunk_id = c.id
      )
      AND i.identifier_key IN (${slots})
      ${legacyClause}
    )
    SELECT c.*,
      GROUP_CONCAT(DISTINCT m.identifier_label) AS identifier_labels,
      COUNT(DISTINCT m.identifier_key) AS matched_identifiers
    FROM matched AS m
    JOIN archive_chunks AS c ON c.id = m.chunk_id
    GROUP BY c.id
    ORDER BY matched_identifiers DESC, c.page ASC, c.chunk_index ASC
    LIMIT ?`;
  const bound = [
    ftsExpression, ...keys, ...clauseKeys,
    ...keys, ...clauseKeys,
    Math.max(1, Math.min(100, limit)),
  ];
  try {
    const result = await archiveDb.prepare(sql).bind(...bound).all();
    return (result?.results || []) as ArchiveEvidenceRow[];
  } catch (error) {
    // Older databases may have the compact JSON table but no FTS virtual
    // table. Preserve exact retrieval while the schema repair is deployed.
    if (!/no such table:\s*(?:main\.)?archive_chunk_search_fts/i.test(String(error))) throw error;
    const fallbackSql = sql.replace(
      /WHERE s\.rowid IN \(\s*SELECT rowid FROM archive_chunk_search_fts\s*WHERE archive_chunk_search_fts MATCH \?\s*\)/,
      'WHERE 1=1',
    );
    if (fallbackSql === sql) throw error;
    const result = await archiveDb.prepare(fallbackSql).bind(...bound.slice(1)).all();
    return (result?.results || []) as ArchiveEvidenceRow[];
  }
}
