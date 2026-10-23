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


// A staged document is visible only through its D1-published generation.
// Legacy rows of a document with an active generation must never leak.
async function publishedExactEvidence(
  db:any,keys:string[],clauses:string[],legacy:ArchiveEvidenceRow[],cap:number
):Promise<ArchiveEvidenceRow[]> {
  const columns=keys.map(()=>"?").join(",");
  const clauseFilter=clauses.length?
    "AND EXISTS(SELECT 1 FROM json_each(e.clauses_json) c WHERE c.value IN ("+
      clauses.map(()=>"?").join(",")+"))":"";
  const sql="SELECT e.chunk_id AS id,e.text,e.document_id AS source_file_id,"+
    "e.file_name,e.source_path,e.page,e.chunk_index,NULL AS content_type,"+
    "e.source_fingerprint,NULL AS identifier_labels,"+
    "COUNT(DISTINCT json_extract(j.value,'$.key')) AS matched_identifiers "+
    "FROM ingestion_staged_evidence e JOIN ingestion_document_publications p "+
    "ON p.document_id=e.document_id AND p.active_generation=e.generation "+
    "JOIN json_each(e.identifiers_json) j "+
    "WHERE json_extract(j.value,'$.key') IN ("+columns+") "+clauseFilter+
    " GROUP BY e.document_id,e.generation,e.chunk_id "+
    "ORDER BY matched_identifiers DESC,e.page,e.chunk_index LIMIT ?";
  let staged:ArchiveEvidenceRow[]=[];
  try {
    const result=await db.prepare(sql).bind(...keys,...clauses,cap).all();
    staged=result?.results||[];
  } catch(error) {
    if(!/no such table:\s*(?:main\.)?ingestion_staged_evidence/i.test(String(error)))
      throw error;
  }
  const seen=new Set<string>();
  const safeLegacy:ArchiveEvidenceRow[]=[];
  for(const row of legacy){
    if(!row.source_file_id){continue;}
    if(!seen.has(row.source_file_id))seen.add(row.source_file_id);
  }
  const published=new Set<string>();
  if(seen.size){
    try {
      const documents=[...seen];
      const result=await db.prepare(
        "SELECT document_id FROM ingestion_document_publications "+
        "WHERE active_generation>0 AND document_id IN ("+
        documents.map(()=>"?").join(",")+")"
      ).bind(...documents).all();
      for(const entry of result?.results||[])published.add(String(entry.document_id));
    } catch(error){
      if(!/no such table:\s*(?:main\.)?ingestion_document_publications/i.test(String(error)))
        throw error;
      // Old schema: no documents can have an active staged generation.
    }
  }
  for(const row of legacy){
    if(row.source_file_id && !published.has(row.source_file_id))
      safeLegacy.push(row);
  }
  return [...staged,...safeLegacy]
    .sort((a,b)=>Number(b.matched_identifiers)-Number(a.matched_identifiers))
    .slice(0,cap);
}

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
    return publishedExactEvidence(archiveDb,keys,clauseKeys,result?.results||[],Math.max(1,Math.min(100,limit)));
  } catch (error) {
    // Older databases may have the compact JSON table but no FTS virtual
    // table. Preserve exact retrieval while the schema repair is deployed.
    // A fresh isolated QA database can contain only staged evidence, without
    // the legacy archive tables. Still query D1-published generations.
    if (/no such table:\s*(?:main\.)?(?:archive_chunks|archive_chunk_search|archive_chunk_identifiers|archive_chunk_clauses)/i.test(String(error))) {
      return publishedExactEvidence(archiveDb,keys,clauseKeys,[],Math.max(1,Math.min(100,limit)));
    }
    if (!/no such table:\s*(?:main\.)?archive_chunk_search_fts/i.test(String(error))) throw error;
    const fallbackSql = sql.replace(
      /WHERE s\.rowid IN \(\s*SELECT rowid FROM archive_chunk_search_fts\s*WHERE archive_chunk_search_fts MATCH \?\s*\)/,
      'WHERE 1=1',
    );
    if (fallbackSql === sql) throw error;
    try {
      const result = await archiveDb.prepare(fallbackSql).bind(...bound.slice(1)).all();
      return publishedExactEvidence(archiveDb,keys,clauseKeys,result?.results||[],Math.max(1,Math.min(100,limit)));
    } catch (fallbackError) {
      // QA databases deliberately contain only generation-staged evidence,
      // no legacy tables and no legacy FTS. Never mask unrelated SQL failures.
      if (/no such table:\s*(?:main\.)?(?:archive_chunks|archive_chunk_search|archive_chunk_identifiers|archive_chunk_clauses)/i.test(String(fallbackError)))
        return publishedExactEvidence(archiveDb,keys,clauseKeys,[],Math.max(1,Math.min(100,limit)));
      throw fallbackError;
    }
  }
}
