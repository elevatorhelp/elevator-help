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
