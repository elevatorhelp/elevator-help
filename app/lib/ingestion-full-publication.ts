import {assertActiveIngestionLease,type IngestionLease} from "./ingestion-lease-guard.ts";

export type StagedExactEvidence={
 id:string;text:string;sourceFileId:string;fileName:string;sourcePath:string;
 page:number;chunkIndex:number;sourceFingerprint:string;
 identifiersJson:string;clausesJson:string;
};
export async function stageExactEvidence(
 db:any,lease:IngestionLease,chunk:StagedExactEvidence
):Promise<void>{
 if(lease.jobKey!==chunk.sourceFileId||!chunk.sourceFingerprint||!chunk.id)
   throw Error("STAGED_EVIDENCE_IDENTITY_MISMATCH");
 await assertActiveIngestionLease(db,lease);
 const now=Date.now();
 // An immutable row can be inserted only while the caller holds the live lease.
 await db.prepare(
   "INSERT OR IGNORE INTO ingestion_staged_evidence "+
   "(document_id,generation,chunk_id,source_fingerprint,text,file_name,source_path,"+
   "page,chunk_index,identifiers_json,clauses_json,created_at_ms) "+
   "SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS("+
   "SELECT 1 FROM ingestion_worker_leases WHERE job_key=? AND owner=? "+
   "AND generation=? AND lease_until_ms>?)")
 .bind(chunk.sourceFileId,lease.generation,chunk.id,chunk.sourceFingerprint,
   chunk.text,chunk.fileName,chunk.sourcePath,chunk.page,chunk.chunkIndex,
   chunk.identifiersJson,chunk.clausesJson,now,
   lease.jobKey,lease.owner,lease.generation,now).run();
 const row=await db.prepare(
   "SELECT source_fingerprint,text,file_name,source_path,page,chunk_index,"+
   "identifiers_json,clauses_json FROM ingestion_staged_evidence "+
   "WHERE document_id=? AND generation=? AND chunk_id=?"
 ).bind(chunk.sourceFileId,lease.generation,chunk.id).first();
 if(!row||row.source_fingerprint!==chunk.sourceFingerprint||
    row.text!==chunk.text||row.file_name!==chunk.fileName||
    row.source_path!==chunk.sourcePath||row.page!==chunk.page||
    row.chunk_index!==chunk.chunkIndex||
    row.identifiers_json!==chunk.identifiersJson||
    row.clauses_json!==chunk.clausesJson)
   throw Error("STAGED_EVIDENCE_IMMUTABILITY_VIOLATION");
 await assertActiveIngestionLease(db,lease);
}
export async function recordStagedMap(
 db:any,lease:IngestionLease,documentId:string,ids:string[],sourceFingerprint:string
):Promise<void>{
 if(lease.jobKey!==documentId||!sourceFingerprint||!Array.isArray(ids)||
   ids.length<1||ids.length>100||
   ids.some(id=>typeof id!=="string"||!id.trim()||id.length>512)||
   new Set(ids).size!==ids.length)
   throw Error("INVALID_STAGED_MAP");
 await assertActiveIngestionLease(db,lease);
 for(const id of ids){
  const now=Date.now();
  await db.prepare(
   "INSERT OR IGNORE INTO ingestion_staged_map_receipts "+
   "(document_id,generation,chunk_id,source_fingerprint,created_at_ms) "+
   "SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ingestion_worker_leases "+
   "WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?)")
    .bind(documentId,lease.generation,id,sourceFingerprint,now,
       lease.jobKey,lease.owner,lease.generation,now).run();
  const row=await db.prepare(
   "SELECT source_fingerprint FROM ingestion_staged_map_receipts "+
   "WHERE document_id=? AND generation=? AND chunk_id=?")
   .bind(documentId,lease.generation,id).first();
  if(row?.source_fingerprint!==sourceFingerprint)
    throw Error("STAGED_MAP_IMMUTABILITY_VIOLATION");
 }
 await assertActiveIngestionLease(db,lease);
}
/** Atomic CAS activates raw vectors, exact evidence and map as ONE generation.
 * Vector readiness must be verified by caller before invoking this operation.
 */
export async function publishFullGeneration(
 db:any,lease:IngestionLease,sourceFingerprint:string,
 rawIds:string[],evidenceIds:string[],mapIds:string[]
):Promise<boolean>{
 const all=[rawIds,evidenceIds,mapIds];
 if(!sourceFingerprint||all.some(xs=>!Array.isArray(xs)||
    xs.length>100000||xs.some(x=>typeof x!=="string"||!x)||
    new Set(xs).size!==xs.length)||rawIds.length===0||evidenceIds.length===0)
   throw Error("INVALID_FULL_PUBLICATION_MANIFEST");
 const now=Date.now();
 const tables=["ingestion_staged_receipts","ingestion_staged_evidence",
   "ingestion_staged_map_receipts"];
 const checks=tables.map((table)=>(
   "(SELECT COUNT(*) FROM "+table+
   " WHERE document_id=? AND generation=?)=? "+
   "AND NOT EXISTS(SELECT 1 FROM "+table+
   " r WHERE r.document_id=? AND r.generation=? AND "+
   "(r.source_fingerprint<>? OR NOT EXISTS("+
   "SELECT 1 FROM json_each(?) j WHERE j.value=r.chunk_id)))"
 )).join(" AND ");
 const sql="UPDATE ingestion_document_publications "+
   "SET active_generation=?,updated_at_ms=? WHERE document_id=? AND job_key=? "+
   "AND active_generation<? "+
   "AND EXISTS(SELECT 1 FROM ingestion_worker_leases WHERE job_key=? "+
   "AND owner=? AND generation=? AND lease_until_ms>?) AND "+checks;
 const params:any[]=[lease.generation,now,lease.jobKey,lease.jobKey,lease.generation,
   lease.jobKey,lease.owner,lease.generation,now];
 for(const ids of all)params.push(lease.jobKey,lease.generation,ids.length,
     lease.jobKey,lease.generation,sourceFingerprint,JSON.stringify(ids));
 const r=await db.prepare(sql).bind(...params).run();
 return Number(r?.meta?.changes)===1;
}
