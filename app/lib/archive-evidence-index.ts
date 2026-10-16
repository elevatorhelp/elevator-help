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
  const keySlots = keys.map(() => "?").join(", ");
  const clauseFilter = clauseKeys.length
    ? `AND EXISTS (
         SELECT 1 FROM archive_chunk_clauses cc
         WHERE cc.chunk_id = c.id
           AND cc.clause_key IN (${clauseKeys.map(() => "?").join(", ")})
       )`
    : "";
  const sql = `
    SELECT c.*,
      GROUP_CONCAT(DISTINCT i.identifier_label) AS identifier_labels,
      COUNT(DISTINCT i.identifier_key) AS matched_identifiers
    FROM archive_chunks c
    JOIN archive_chunk_identifiers i ON i.chunk_id = c.id
    WHERE i.identifier_key IN (${keySlots})
      ${clauseFilter}
    GROUP BY c.id
    ORDER BY matched_identifiers DESC, c.page ASC, c.chunk_index ASC
    LIMIT ?`;
  const result = await archiveDb
    .prepare(sql)
    .bind(...keys, ...clauseKeys, Math.max(1, Math.min(100, limit)))
    .all();
  return (result?.results || []) as ArchiveEvidenceRow[];
}
