import type { ReferenceIdentifier } from "./reference-identifiers.ts";
import {searchPublishedImmutableEvidence} from "./ingestion-v2-evidence-references.ts";
import {searchPublishedRevisionEvidence} from "./ingestion-map-revision-evidence.ts";

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

// In strict published-read mode a V2-published document supersedes every
// legacy exact-source row. Fail closed on missing schema or D1 errors.
export async function onlyUnsupersededLegacyRows(
  db:any,rows:ArchiveEvidenceRow[],
):Promise<ArchiveEvidenceRow[]>{
  // This additional opt-in marker is NOT set in the live environment.
  // If enabled during a reviewed migration, any revision candidate is an
  // explicit deny-legacy-fallback marker, including before activation and
  // after rollback. Missing migration schema => no legacy evidence.
  const mapRevisionGate=db?.__mapRevisionReadGate===true;
  if(!db?.__immutableReadGate&&!mapRevisionGate)return rows;
  const cache=new Map<string,Promise<any>>();
  const revised=new Map<string,Promise<any>>();
  const safe:ArchiveEvidenceRow[]=[];
  for(const row of rows){
    const doc=row.source_file_id;
    if(typeof doc!=="string"||!doc.trim())continue;
    let publication=cache.get(doc);
    if(!publication){
      publication=Promise.resolve().then(()=>db.prepare(
        "SELECT active_generation FROM ingestion_v2_publications WHERE document_id=?"
      ).bind(doc).first());
      cache.set(doc,publication);
    }
    try {
      if(mapRevisionGate){
        let marker=revised.get(doc);
        if(!marker){
          marker=Promise.resolve().then(()=>db.prepare(
            "SELECT 1 AS present FROM ingestion_v2_map_revision_candidates WHERE document_id=? LIMIT 1"
          ).bind(doc).first());
          revised.set(doc,marker);
        }
        // Candidate presence blocks *all* legacy evidence, even when the
        // new Map pointer is not yet active. Stale-old B never becomes a citation.
        if(await marker)continue;
      }
      if(!(await publication))safe.push(row);
    }catch{
      // Missing revision tables or D1 outage must never leak legacy text.
    }
  }
  return safe;
}

async function mergePublishedEvidenceRows(
  db:any,rows:ArchiveEvidenceRow[],
  identifiers:ReferenceIdentifier[],clauses:string[],limit:number,
):Promise<ArchiveEvidenceRow[]>{
  const legacy=await onlyUnsupersededLegacyRows(db,rows);
  if(!db?.__immutableReadGate)return legacy;
  // New generation's exact source pages are discoverable only via the
  // published generation + matching identifier/clause terms, never staging.
  let published:ArchiveEvidenceRow[];
  try {
    published=await searchPublishedImmutableEvidence(db,identifiers,clauses,
      Math.max(1,Math.min(100,limit)));
  }catch {
    // An untrusted or unavailable D1 publication/terms table cannot prove
    // which source pages are current. Fail closed for the entire result.
    return [];
  }
  // In the NEW opt-in revision gate, a candidate is a deny-fallback
  // marker not only for archive_chunks, but ALSO for any previously published
  // exact Evidence from the old immutable search. Every new B citation must
  // be attested against its activated revision + BOTH Vectorize indexes.
  let acceptedPublished=published;
  let revised:ArchiveEvidenceRow[]=[];
  if(db?.__mapRevisionReadGate===true){
    const pair=db?.__mapRevisionIndexes;
    if(!Array.isArray(pair)||pair.length!==2||
       pair.some((x:any)=>typeof x?.getByIds!=="function"))return [];
    try{
      const candidateByDoc=new Map<string,Promise<any>>();
      const safe:ArchiveEvidenceRow[]=[];
      for(const row of published){
        let marker=candidateByDoc.get(row.source_file_id);
        if(!marker){
          marker=Promise.resolve().then(()=>db.prepare(
            "SELECT 1 AS present FROM ingestion_v2_map_revision_candidates WHERE document_id=? LIMIT 1"
          ).bind(row.source_file_id).first());
          candidateByDoc.set(row.source_file_id,marker);
        }
        if(!(await marker))safe.push(row);
      }
      acceptedPublished=safe;
      revised=await searchPublishedRevisionEvidence(
        db,identifiers,clauses,pair,Math.max(1,Math.min(100,limit)));
    }catch{return []}
  }
  return [...revised,...acceptedPublished,...legacy]
    .sort((a,b)=>(Number(b.matched_identifiers)||0)-(Number(a.matched_identifiers)||0)||
      Number(a.page)-Number(b.page))
    .slice(0,Math.max(1,Math.min(100,limit)));
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
    return mergePublishedEvidenceRows(archiveDb,(result?.results || []) as ArchiveEvidenceRow[],identifiers,clauses,limit);
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
    return mergePublishedEvidenceRows(archiveDb,(result?.results || []) as ArchiveEvidenceRow[],identifiers,clauses,limit);
  }
}
