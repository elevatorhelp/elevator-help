/**
 * Two-phase immutable index publication protocol.
 *
 * A worker writes to a generation-qualified staging namespace, never directly
 * over an active vector ID. Readers must resolve the published generation from
 * D1 before using staged vectors. D1 CAS is the sole publication point.
 * A crashed/stale writer may leave orphaned staged vectors, but cannot publish
 * them after ownership changes. Garbage collection must be separate.
 *
 * This module is a protocol primitive; production Vectorize retrieval is NOT
 * yet wired to generation filtering. Never enable concurrent ingestion solely
 * because this module exists.
 */
import {assertActiveIngestionLease, type IngestionLease} from "./ingestion-lease-guard";
export function stagedVectorId(id:string,generation:number):string {
 if(!id||!Number.isSafeInteger(generation)||generation<1)throw Error("INVALID_STAGING_ID");
 return `g${generation}:${id}`;
}
export async function publishStagedGeneration(db:any,lease:IngestionLease,documentId:string):Promise<boolean>{
 if(!documentId||documentId.length>256)throw Error("INVALID_DOCUMENT_ID");
 await assertActiveIngestionLease(db,lease);
 // Atomic publication: UPDATE and lease validation are in the same SQL statement.
 // A changed or expired lease makes the UPDATE affect zero rows.
 const result=await db.prepare(`UPDATE ingestion_document_publications
 SET active_generation=?, updated_at_ms=?
 WHERE document_id=? AND job_key=?
 AND EXISTS (SELECT 1 FROM ingestion_worker_leases
  WHERE job_key=? AND owner=? AND generation=?
  AND lease_until_ms>?)`)
 .bind(lease.generation,Date.now(),documentId,lease.jobKey,lease.jobKey,lease.owner,lease.generation,Date.now()).run();
 return Number(result?.meta?.changes)===1;
}

/** Durable receipt is written only after both Vectorize indexes acknowledge a batch.
 * The receipt table has PRIMARY KEY(document_id,generation,chunk_id).
 * Staged IDs are immutable; retries of the same batch are idempotent.
 */
export async function recordStagedBatch(db:any,lease:IngestionLease,documentId:string,ids:string[]):Promise<void>{
 if(!ids.length||ids.length>8||new Set(ids).size!==ids.length)throw Error("INVALID_STAGED_BATCH");
 await assertActiveIngestionLease(db,lease);
 for(const id of ids){
  const now=Date.now();
  const result=await db.prepare(`INSERT OR IGNORE INTO ingestion_staged_receipts
    (document_id,generation,chunk_id,created_at_ms)
    SELECT ?,?,?,? WHERE EXISTS(
      SELECT 1 FROM ingestion_worker_leases WHERE job_key=? AND owner=?
      AND generation=? AND lease_until_ms>?)`)
   .bind(documentId,lease.generation,id,now,lease.jobKey,lease.owner,lease.generation,now).run();
  // Duplicate receipts are expected on retries; validation happens at final CAS.
  if(result?.success===false)throw Error("STAGED_RECEIPT_WRITE_FAILED");
 }
 await assertActiveIngestionLease(db,lease);
}

/** Single D1 statement is the linearization point. Publication cannot occur
 * until exactly expectedChunks distinct receipts exist for this generation.
 * Caller must supply a trusted, final total, not a per-batch count.
 */
export async function publishCompleteStagedGeneration(db:any,lease:IngestionLease,documentId:string,expectedChunks:number):Promise<boolean>{
 if(!Number.isSafeInteger(expectedChunks)||expectedChunks<1||expectedChunks>100000)throw Error("INVALID_EXPECTED_CHUNKS");
 if(lease.jobKey!==documentId)throw Error("LEASE_DOCUMENT_MISMATCH");
 const now=Date.now();
 const result=await db.prepare(`UPDATE ingestion_document_publications
 SET active_generation=?,updated_at_ms=?
 WHERE document_id=? AND job_key=?
 AND EXISTS(SELECT 1 FROM ingestion_worker_leases WHERE job_key=? AND owner=?
  AND generation=? AND lease_until_ms>?)
 AND (SELECT COUNT(*) FROM ingestion_staged_receipts
  WHERE document_id=? AND generation=?)=?`)
 .bind(lease.generation,now,documentId,lease.jobKey,lease.jobKey,lease.owner,
  lease.generation,now,documentId,lease.generation,expectedChunks).run();
 return Number(result?.meta?.changes)===1;
}
