import {NextResponse} from "next/server";
import {getCloudflareContext} from "@opennextjs/cloudflare";
import {timingSafeEqual} from "node:crypto";
import {
  claimGlobalArchiveLease, renewGlobalArchiveLease, releaseGlobalArchiveLease,
  readDurableArchiveCheckpoint, writeDurableArchiveCheckpoint,
  type ArchiveLease, type CoordinatorDB,
} from "../../lib/ingestion-global-coordinator";

export const dynamic="force-dynamic";
// Preparation only. No Production flag, table, or caller is enabled by this PR.
// Do NOT enable two independent writers without generation-qualified atomic
// publication fences on D1 + Vectorize.
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
const reply=(value:Record<string,unknown>,status=200)=>
  NextResponse.json(value,{status,headers});

function allowedBearer(actual:string, secret:string|undefined):boolean {
  if(typeof secret!=="string"||secret.length<24)return false;
  const expected="Bearer "+secret;
  const first=Buffer.from(actual,"utf8");
  const second=Buffer.from(expected,"utf8");
  return first.length===second.length && timingSafeEqual(first,second);
}
function errorStatus(error:unknown):number {
  const code=error instanceof Error?error.message:"";
  return /^(INVALID_|DURABLE_CHECKPOINT_SIZE_LIMIT)/.test(code)?400:503;
}
export async function POST(request:Request) {
  if(!allowedBearer(request.headers.get("authorization")||"",process.env.INGESTION_TOKEN))
    return reply({ok:false,error:"UNAUTHORIZED"},401);

  let env:Record<string,unknown>;
  try {env=getCloudflareContext().env as unknown as Record<string,unknown>;}
  catch{return reply({ok:false,error:"COORDINATOR_UNAVAILABLE"},503);}

  const configured=(env.INGESTION_COORDINATOR_ENABLED??process.env.INGESTION_COORDINATOR_ENABLED);
  if(configured!=="true")return reply({ok:false,error:"COORDINATOR_DISABLED"},404);

  const allowedJob=env.INGESTION_COORDINATOR_JOB_KEY??process.env.INGESTION_COORDINATOR_JOB_KEY;
  const db=env.CORTEX_DB as CoordinatorDB|undefined;
  if(typeof allowedJob!=="string"||!/^drive:[A-Za-z0-9_-]{10,128}$/.test(allowedJob)||!db?.prepare)
    return reply({ok:false,error:"COORDINATOR_NOT_CONFIGURED"},503);

  let data:Record<string,unknown>;
  try {
    const length=Number(request.headers.get("content-length"));
    if(Number.isFinite(length)&&length>1_400_000)
      return reply({ok:false,error:"REQUEST_TOO_LARGE"},413);
    const raw=await request.text();
    if(Buffer.byteLength(raw,"utf8")>1_400_000)
      return reply({ok:false,error:"REQUEST_TOO_LARGE"},413);
    const value=JSON.parse(raw);
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error("BAD_JSON");
    data=value;
  }catch{return reply({ok:false,error:"INVALID_REQUEST"},400);}
  if(data.jobKey!==allowedJob)
    return reply({ok:false,error:"INVALID_COORDINATOR_JOB_SCOPE"},403);

  try {
    const action=data.action;
    const now=Date.now();
    if(action==="claim") {
      if(typeof data.owner!=="string" || typeof data.ttlMs!=="number")
        return reply({ok:false,error:"INVALID_CLAIM"},400);
      const lease=await claimGlobalArchiveLease(db,allowedJob,data.owner,data.ttlMs,now);
      return lease?reply({ok:true,lease}):reply({ok:false,error:"ARCHIVE_LEASE_BUSY"},409);
    }
    const lease=data.lease as ArchiveLease|undefined;
    if(!lease||lease.jobKey!==allowedJob)
      return reply({ok:false,error:"INVALID_LEASE_SCOPE"},403);
    if(action==="renew") {
      if(typeof data.ttlMs!=="number")return reply({ok:false,error:"INVALID_RENEW"},400);
      const ok=await renewGlobalArchiveLease(db,lease,data.ttlMs,now);
      return ok?reply({ok:true}):reply({ok:false,error:"ARCHIVE_LEASE_STALE"},409);
    }
    if(action==="release") {
      const ok=await releaseGlobalArchiveLease(db,lease,now);
      return ok?reply({ok:true}):reply({ok:false,error:"ARCHIVE_LEASE_STALE"},409);
    }
    if(action==="read_checkpoint") {
      const snapshot=await readDurableArchiveCheckpoint(db,lease,now);
      return snapshot?reply({ok:true,...snapshot}):reply({ok:false,error:"CHECKPOINT_NOT_FOUND_OR_LEASE_STALE"},404);
    }
    if(action==="write_checkpoint") {
      if(typeof data.previousVersion!=="number")
        return reply({ok:false,error:"INVALID_CHECKPOINT_VERSION"},400);
      const snapshot=await writeDurableArchiveCheckpoint(db,lease,data.previousVersion,data.state,now);
      return snapshot?reply({ok:true,...snapshot}):reply({ok:false,error:"CHECKPOINT_CAS_OR_LEASE_STALE"},409);
    }
    return reply({ok:false,error:"UNKNOWN_COORDINATOR_ACTION"},400);
  }catch(error) {
    // Never return raw D1 / source / SQL errors to API users.
    const status=errorStatus(error);
    return reply({ok:false,error:status===400?"INVALID_COORDINATOR_ARGUMENT":"COORDINATOR_UNAVAILABLE"},status);
  }
}
