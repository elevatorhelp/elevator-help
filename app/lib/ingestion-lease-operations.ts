/** Atomic D1 ownership protocol for a single document; feature-gated at the route. */
import {parseIngestionLease, type IngestionLease} from "./ingestion-lease-guard.ts";
const DURATION_MIN_MS=30000;
const DURATION_MAX_MS=300000;
export function leaseDuration(value:unknown):number {
 const v=Number(value ?? 180000);
 if(!Number.isSafeInteger(v)||v<DURATION_MIN_MS||v>DURATION_MAX_MS)
   throw Error("INVALID_LEASE_DURATION");
 return v;
}
export async function claimIngestionLease(db:any,jobKey:string,owner:string,durationMs=180000,now=Date.now()):Promise<IngestionLease|null>{
 const identity=parseIngestionLease({jobKey,owner,generation:1});
 if(!identity||!db?.prepare)throw Error("INVALID_LEASE_REQUEST");
 leaseDuration(durationMs);
 const r=await db.prepare(`INSERT INTO ingestion_worker_leases
 (job_key,owner,generation,lease_until_ms,updated_at_ms)
 VALUES(?,?,1,?,?)
 ON CONFLICT(job_key) DO UPDATE SET
 owner=excluded.owner,generation=ingestion_worker_leases.generation+1,
 lease_until_ms=excluded.lease_until_ms,updated_at_ms=excluded.updated_at_ms
 WHERE ingestion_worker_leases.lease_until_ms<=?`)
 .bind(jobKey,owner,now+durationMs,now,now).run();
 if(Number(r?.meta?.changes)!==1)return null;
 const row=await db.prepare("SELECT owner,generation,lease_until_ms FROM ingestion_worker_leases WHERE job_key=?").bind(jobKey).first();
 if(row?.owner!==owner||Number(row.lease_until_ms)<=now)return null;
 return {jobKey,owner,generation:Number(row.generation)};
}
export async function renewIngestionLease(db:any,lease:IngestionLease,durationMs=180000,now=Date.now()):Promise<boolean>{
 if(!parseIngestionLease(lease))throw Error("INVALID_LEASE_REQUEST");
 leaseDuration(durationMs);
 const r=await db.prepare(`UPDATE ingestion_worker_leases
 SET lease_until_ms=?,updated_at_ms=?
 WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?`)
 .bind(now+durationMs,now,lease.jobKey,lease.owner,lease.generation,now).run();
 return Number(r?.meta?.changes)===1;
}
