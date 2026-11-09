/**
 * Industry-independent exact identifier/clause resolver for immutable Evidence.
 * All reads join D1's PUBLISHED generation. Unpublished pages never become
 * citations, even if identifier terms are staged in an earlier request.
 */
import {
  extractReferenceIdentifiers, type ReferenceIdentifier,
} from "./reference-identifiers.ts";
import {extractClauseNumbers} from "./standard-identifiers.ts";
import {validateArchiveLease,type ArchiveLease,type CoordinatorDB} from "./ingestion-global-coordinator.ts";
import type {ExactEvidence} from "./ingestion-immutable-publication.ts";

export type PublishedV2EvidenceRow={
 id:string;text:string;source_file_id:string;file_name:string;source_path:string;
 page:number;chunk_index:number;content_type:string|null;
 source_fingerprint:string;identifier_labels:string|null;matched_identifiers:number;
};
const MAX_REFS=30,MAX_CLAUSES=40,MAX_RESULT=100;

export async function stageImmutableEvidenceReferenceTerms(
 db:CoordinatorDB,lease:ArchiveLease,documentId:string,
 evidence:ExactEvidence,now=Date.now(),
):Promise<number>{
  validateArchiveLease(lease);
  if(!documentId||documentId.length>180||
     !evidence?.logicalId||!evidence?.sourceFingerprint||!evidence?.text||
     !Number.isSafeInteger(now)||now<=0)
    throw Error("INVALID_IMMUTABLE_EVIDENCE_REFERENCE");
  const reference=extractReferenceIdentifiers(evidence.text,[evidence.fileName])
    .filter(x=>x.structured).slice(0,MAX_REFS)
    .map(x=>({kind:"reference",key:x.key,label:x.label}));
  const clause=extractClauseNumbers(evidence.text).slice(0,MAX_CLAUSES)
    .map(x=>({kind:"clause",key:x,label:x}));
  const unique=new Map<string,{kind:string;key:string;label:string}>();
  for(const entry of [...reference,...clause]){
    if(typeof entry.key!=="string"||entry.key.length<2||entry.key.length>120||
       typeof entry.label!=="string"||entry.label.length>120)continue;
    unique.set(entry.kind+":"+entry.key,entry);
  }
  let count=0;
  for(const item of unique.values()){
    const row=await db.prepare(`
      INSERT INTO ingestion_v2_evidence_terms
        (document_id,generation,logical_id,source_fingerprint,
         kind,term_key,label,created_at_ms)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(
        SELECT 1 FROM ingestion_global_leases
        WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
      ) AND EXISTS(
        SELECT 1 FROM ingestion_v2_staged_evidence e
        WHERE e.document_id=? AND e.generation=? AND e.logical_id=?
          AND e.source_fingerprint=?
      )
      ON CONFLICT(document_id,generation,logical_id,kind,term_key)
      DO UPDATE SET created_at_ms=ingestion_v2_evidence_terms.created_at_ms
      WHERE ingestion_v2_evidence_terms.source_fingerprint=excluded.source_fingerprint
        AND ingestion_v2_evidence_terms.label=excluded.label
      RETURNING term_key
    `).bind(documentId,lease.generation,evidence.logicalId,evidence.sourceFingerprint,
      item.kind,item.key,item.label,now,lease.jobKey,lease.owner,lease.generation,now,
      documentId,lease.generation,evidence.logicalId,evidence.sourceFingerprint).first();
    if(row?.term_key!==item.key)throw Error("IMMUTABLE_REFERENCE_TERM_STAGING_DENIED");
    count++;
  }
  return count;
}

export async function searchPublishedImmutableEvidence(
 db:{prepare:(sql:string)=>{bind:(...args:unknown[])=>{
   all:()=>Promise<{results:Record<string,unknown>[]}>
 }}},identifiers:ReferenceIdentifier[],clauses:string[]=[],limit=60,
):Promise<PublishedV2EvidenceRow[]>{
  if(!Array.isArray(identifiers)||!Array.isArray(clauses)||
     !Number.isSafeInteger(limit)||limit<1||limit>MAX_RESULT)
    throw Error("INVALID_IMMUTABLE_EVIDENCE_SEARCH");
  const keys=[...new Set(identifiers.map(x=>x?.key).filter(
    (k):k is string=>typeof k==="string"&&k.length>=2&&k.length<=120,
  ))].slice(0,30);
  const clausesSafe=[...new Set(clauses.filter(
    k=>typeof k==="string"&&k.length>=2&&k.length<=120,
  ))].slice(0,40);
  if(!keys.length)return [];
  const qs=(arr:string[])=>arr.map(()=>"?").join(",");
  const clauseFilter=clausesSafe.length?`
    AND EXISTS(
      SELECT 1 FROM ingestion_v2_evidence_terms c
      WHERE c.document_id=e.document_id AND c.generation=e.generation
        AND c.logical_id=e.logical_id AND c.kind='clause'
        AND c.term_key IN (${qs(clausesSafe)})
    )`:"";
  const sql=`
    SELECT e.logical_id AS id,e.text,e.document_id AS source_file_id,
      e.file_name,e.source_path,e.page,e.chunk_index,
      NULL AS content_type,e.source_fingerprint,
      GROUP_CONCAT(DISTINCT t.label) AS identifier_labels,
      COUNT(DISTINCT t.term_key) AS matched_identifiers
    FROM ingestion_v2_evidence_terms t
    JOIN ingestion_v2_staged_evidence e
      ON e.document_id=t.document_id AND e.generation=t.generation
      AND e.logical_id=t.logical_id AND e.source_fingerprint=t.source_fingerprint
    JOIN ingestion_v2_publications p
      ON p.document_id=e.document_id AND p.active_generation=e.generation
      AND p.source_fingerprint=e.source_fingerprint
    WHERE t.kind='reference' AND t.term_key IN (${qs(keys)})
      ${clauseFilter}
    GROUP BY e.document_id,e.generation,e.logical_id
    ORDER BY matched_identifiers DESC,e.page ASC,e.chunk_index ASC
    LIMIT ?
  `;
  const result=await db.prepare(sql).bind(...keys,...clausesSafe,limit).all();
  if(!Array.isArray(result?.results))
    throw Error("PUBLISHED_V2_EVIDENCE_SEARCH_UNAVAILABLE");
  return result.results as PublishedV2EvidenceRow[];
}
