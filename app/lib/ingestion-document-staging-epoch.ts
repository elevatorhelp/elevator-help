/**
 * Per-document durable staging epoch, independent from the short-lived
 * root lease generation. The lease fences WRITERS, whereas staging epoch
 * names one immutable source revision across multiple bounded jobs.
 *
 * All allocations occur in a single D1 SQL statement that checks the
 * live lease; never create or advance an epoch from an expired writer.
 */
import {validateArchiveLease,type ArchiveLease,type CoordinatorDB} from "./ingestion-global-coordinator.ts";

export function validateStagingEpoch(epoch:unknown):asserts epoch is number{
  if(!Number.isSafeInteger(epoch)||Number(epoch)<1)
    throw Error("INVALID_DOCUMENT_STAGING_EPOCH");
}
export async function claimDocumentStagingEpoch(
 db:CoordinatorDB,lease:ArchiveLease,documentId:string,
 sourceFingerprint:string,now=Date.now(),
):Promise<number|null>{
  validateArchiveLease(lease);
  if(typeof documentId!=="string"||!documentId.trim()||documentId.length>180||
     typeof sourceFingerprint!=="string"||!sourceFingerprint.trim()||
     sourceFingerprint.length>256||!Number.isSafeInteger(now)||now<=0)
    throw Error("INVALID_DOCUMENT_STAGING_REQUEST");
  // Every source-fingerprint change, including an embed-version change
  // included in the fingerprint, creates a new monotonic document epoch.
  // Claiming the SAME source fingerprint under a successor root lease
  // returns the unchanged epoch and reuses prior partial evidence/receipts.
  const row=await db.prepare(`
    INSERT INTO ingestion_v2_document_epochs
      (document_id,job_key,staging_epoch,source_fingerprint,updated_at_ms)
    SELECT ?,?,1,?,? WHERE EXISTS(
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    )
    ON CONFLICT(document_id) DO UPDATE SET
      staging_epoch=CASE
        WHEN ingestion_v2_document_epochs.source_fingerprint=excluded.source_fingerprint
          THEN ingestion_v2_document_epochs.staging_epoch
        ELSE ingestion_v2_document_epochs.staging_epoch+1
      END,
      source_fingerprint=excluded.source_fingerprint,
      updated_at_ms=excluded.updated_at_ms
    WHERE ingestion_v2_document_epochs.job_key=excluded.job_key
      AND ingestion_v2_document_epochs.staging_epoch<9007199254740991
      AND EXISTS(
        SELECT 1 FROM ingestion_global_leases
        WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
      )
    RETURNING staging_epoch,source_fingerprint
  `).bind(documentId,lease.jobKey,sourceFingerprint,now,
    lease.jobKey,lease.owner,lease.generation,now,
    lease.jobKey,lease.owner,lease.generation,now).first();
  if(!row)return null;
  const epoch=Number(row.staging_epoch);
  validateStagingEpoch(epoch);
  if(row.source_fingerprint!==sourceFingerprint)
    throw Error("DOCUMENT_STAGING_SOURCE_MISMATCH");
  return epoch;
}

/** SQL read-only receipt condition used IN THE SAME D1 mutation as ownership.
 * The physical Vectorize insert is not atomic with D1, but no stale or
 * superseded document epoch is permitted to create a durable receipt.
 */
export const DOCUMENT_STAGING_EPOCH_FENCE_SQL=`
  AND EXISTS(
    SELECT 1 FROM ingestion_v2_document_epochs
    WHERE document_id=? AND job_key=? AND staging_epoch=?
      AND source_fingerprint=?
  )`;
