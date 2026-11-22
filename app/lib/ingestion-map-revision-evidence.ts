/**
 * Issue #106: default-OFF active-revision exact Evidence discovery.
 * Only invoked when the separate Map revision read gate was explicitly
 * authorized. D1 term lookup is NOT sufficient for publication: every
 * candidate must also belong to a validated document-wide active revision
 * and two independently attested Map indexes.
 *
 * No remote calls beyond the caller's already connected D1/Vectorize.
 */
import type {ReferenceIdentifier} from "./reference-identifiers.ts";
import type {CoordinatorDB} from "./ingestion-global-coordinator.ts";
import type {ImmutableIndex} from "./ingestion-immutable-publication.ts";
import {readGenericPublishedEvidencePreview}
 from "./ingestion-map-revision-visibility.ts";
import type {PublishedV2EvidenceRow}
 from "./ingestion-v2-evidence-references.ts";

type Db=CoordinatorDB;
const bindList=(x:unknown[])=>x.map(()=>"?").join(",");
export async function searchPublishedRevisionEvidence(
 db:Db,identifiers:ReferenceIdentifier[],clauses:string[],
 indexes:readonly [ImmutableIndex,ImmutableIndex],
 limit=60,
):Promise<PublishedV2EvidenceRow[]>{
 if(!db?.prepare||indexes?.length!==2||
    indexes.some(i=>typeof i?.getByIds!=="function")||
    !Array.isArray(identifiers)||!Array.isArray(clauses)||
    !Number.isSafeInteger(limit)||limit<1||limit>100)
    return [];
 const keys=[...new Set(identifiers.map(x=>x?.key).filter(
  (x):x is string=>typeof x==="string"&&x.length>=2&&x.length<=120,
 ))].slice(0,30);
 const safeClauses=[...new Set(clauses.filter(
   x=>typeof x==="string"&&x.length>=2&&x.length<=120,
 ))].slice(0,40);
 if(!keys.length)return [];
 const clauseCheck=safeClauses.length?
   `AND EXISTS(SELECT 1 FROM ingestion_v2_evidence_terms c
     WHERE c.document_id=e.document_id AND c.generation=e.generation
       AND c.logical_id=e.logical_id AND c.kind='clause'
       AND c.term_key IN (${bindList(safeClauses)}))`:"";
 const sql=`SELECT e.logical_id AS id,e.text,
  e.document_id AS source_file_id,e.file_name,e.source_path,
  e.page,e.chunk_index,NULL AS content_type,e.source_fingerprint,
  GROUP_CONCAT(DISTINCT t.label) AS identifier_labels,
  COUNT(DISTINCT t.term_key) AS matched_identifiers
  FROM ingestion_v2_evidence_terms t
  JOIN ingestion_v2_staged_evidence e
    ON e.document_id=t.document_id AND e.generation=t.generation
     AND e.logical_id=t.logical_id
     AND e.source_fingerprint=t.source_fingerprint
  JOIN ingestion_v2_map_revision_activations p
    ON p.document_id=e.document_id AND p.staging_epoch=e.generation
     AND p.source_fingerprint=e.source_fingerprint AND p.state='active'
  JOIN ingestion_v2_map_revision_candidates v
    ON v.document_id=p.document_id AND v.staging_epoch=p.staging_epoch
     AND v.revision=p.revision AND v.job_key=p.job_key
     AND v.source_fingerprint=p.source_fingerprint AND v.state='embedded'
  WHERE t.kind='reference' AND t.term_key IN (${bindList(keys)})
    ${clauseCheck}
  GROUP BY e.document_id,e.generation,e.logical_id
  ORDER BY matched_identifiers DESC,e.page,e.chunk_index
  LIMIT ?`;
 try{
  const bounded=await (db.prepare(sql).bind(...keys,...safeClauses,100) as unknown as {
    all:()=>Promise<{results:Record<string,unknown>[]}>
  }).all();
  if(!Array.isArray(bounded?.results))return [];
  const proven=new Map<string,Promise<ReturnType<typeof readGenericPublishedEvidencePreview> extends Promise<infer V>?V:never>>();
  const output:PublishedV2EvidenceRow[]=[];
  for(const x of bounded.results){
   if(output.length>=limit)break;
   const doc=x.source_file_id;
   if(typeof doc!=="string"||!doc||typeof x.id!=="string")continue;
   let trusted=proven.get(doc);
   if(!trusted){
    trusted=readGenericPublishedEvidencePreview(db,doc,indexes,250);
    proven.set(doc,trusted);
   }
   const all=await trusted;
   const match=all.find(v=>v.logicalId===x.id);
   if(!match||match.text!==x.text||
      match.fileName!==x.file_name||match.sourcePath!==x.source_path||
      match.page!==x.page||match.chunkIndex!==x.chunk_index||
      match.sourceFingerprint!==x.source_fingerprint)continue;
   output.push(x as PublishedV2EvidenceRow);
  }
  return output;
 }catch{
  return []; // No fallback to stale reference terms on any D1/index failure
 }
}
