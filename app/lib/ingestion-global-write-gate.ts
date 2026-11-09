/**
 * Global archive lease preflight shared by Evidence / RAW / Map ingestion.
 * IMPORTANT: A preflight does NOT atomically fence asynchronous Vectorize writes.
 * This stays opt-in and disabled in Production until generation-qualified
 * staging and conditional publication are independently verified.
 */
import {validateArchiveLease, type ArchiveLease, type CoordinatorDB} from "./ingestion-global-coordinator.ts";

type RuntimeVars={
  INGESTION_GLOBAL_WRITE_GATE_ENABLED?:unknown;
  INGESTION_COORDINATOR_ENABLED?:unknown;
  INGESTION_COORDINATOR_JOB_KEY?:unknown;
  CORTEX_DB?:unknown;
};
type ClaimedBody={globalArchiveLease?:unknown};

export class GlobalArchiveWriteDenied extends Error {
  readonly code:string;
  constructor(code:string) {super(code);this.code=code;this.name="GlobalArchiveWriteDenied";}
}
const denied=(code:string):never=>{throw new GlobalArchiveWriteDenied(code);};
const approvedKey=(s:unknown):s is string=>
  typeof s==="string" && /^drive:[A-Za-z0-9_-]{10,128}$/.test(s);

/**
 * Returns a guard to revalidate before EACH irreversible boundary.
 * A disabled gate is a no-op for the existing serial worker.
 * Enabled but missing/malformed config ALWAYS fails closed.
 */
export function makeGlobalArchiveWriteGuard(
  env:RuntimeVars|null|undefined, body:ClaimedBody|null|undefined,
  now:()=>number=Date.now,
):()=>Promise<void> {
  if(env?.INGESTION_GLOBAL_WRITE_GATE_ENABLED!=="true")return async()=>{};
  if(env?.INGESTION_COORDINATOR_ENABLED!=="true" ||
     !approvedKey(env?.INGESTION_COORDINATOR_JOB_KEY) ||
     !env.CORTEX_DB || typeof (env.CORTEX_DB as CoordinatorDB).prepare!=="function") {
    return async()=>denied("GLOBAL_ARCHIVE_COORDINATOR_NOT_READY");
  }
  const job=env.INGESTION_COORDINATOR_JOB_KEY;
  const candidate=body?.globalArchiveLease;
  let lease:ArchiveLease;
  try {
    validateArchiveLease(candidate as ArchiveLease);
    lease=candidate as ArchiveLease;
  }catch{return async()=>denied("GLOBAL_ARCHIVE_LEASE_REQUIRED");}
  if(lease.jobKey!==job)return async()=>denied("GLOBAL_ARCHIVE_LEASE_SCOPE_MISMATCH");

  const db=env.CORTEX_DB as CoordinatorDB;
  return async()=>{
    let row:Record<string,unknown>|null;
    try {
      row=await db.prepare(`
        SELECT 1 AS valid FROM ingestion_global_leases
        WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
      `).bind(lease.jobKey,lease.owner,lease.generation,now()).first();
    }catch {
      return denied("GLOBAL_ARCHIVE_LEASE_DB_UNAVAILABLE");
    }
    if(Number(row?.valid)!==1)return denied("GLOBAL_ARCHIVE_LEASE_STALE");
  };
}
