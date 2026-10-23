/** Fail-closed lease check for ingestion endpoints. This is a preflight fence,
 * NOT atomic with external Vectorize writes. Do not enable parallel writers
 * until an external side-effect protocol closes that TOCTOU gap. */
export type IngestionLease = {jobKey:string;owner:string;generation:number};
export function parseIngestionLease(value:unknown):IngestionLease|null {
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(typeof v.jobKey!=="string"||!/^[-\w:.]{1,200}$/.test(v.jobKey))return null;
 if(typeof v.owner!=="string"||!/^[-\w:.]{1,200}$/.test(v.owner))return null;
 if(!Number.isSafeInteger(v.generation)||Number(v.generation)<1)return null;
 return {jobKey:v.jobKey,owner:v.owner,generation:Number(v.generation)};
}
export async function assertActiveIngestionLease(db:any,lease:IngestionLease,now=Date.now()):Promise<void>{
 if(!db?.prepare)throw new Error("INGESTION_LEASE_DB_UNAVAILABLE");
 const row=await db.prepare("SELECT 1 AS valid FROM ingestion_worker_leases WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?").bind(lease.jobKey,lease.owner,lease.generation,now).first();
 if(!row?.valid)throw new Error("INGESTION_LEASE_EXPIRED_OR_STALE");
}
