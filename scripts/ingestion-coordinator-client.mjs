import {createHash} from "node:crypto";

// Opt-in coordinator client for the existing serial ingestion runner.
// OFF unless the caller explicitly requests D1 authoritative mode.
// The D1 endpoint is private and itself stays feature-gated in Production.
export const COORDINATOR_ENDPOINT="https://elevator.help/api/ingestion-coordinator";
export const LEASE_TTL_MS=180_000;
export const HEARTBEAT_MS=45_000;
const MAX_SOURCE_FILES=200_000;

export function validateCoordinatorState(state,rootId){
  if(!state||typeof state!=="object"||Array.isArray(state)||
     state.version!==3||state.parallelShard||
     !state.scopes||typeof state.scopes!=="object"||Array.isArray(state.scopes))
     throw Error("D1_COORDINATOR_INVALID_STATE");
  const root=state.scopes[rootId];
  if(!root||typeof root!=="object"||Array.isArray(root)||
     !root.files||typeof root.files!=="object"||Array.isArray(root.files)||
     Object.keys(root.files).length<100||
     Object.keys(root.files).length>MAX_SOURCE_FILES)
     throw Error("D1_COORDINATOR_INSUFFICIENT_SCOPE_CHECKPOINT");
  return state;
}
export async function createIngestionCoordinatorSession({
  token,rootId,runId,runAttempt="1",legacyState,bootstrapApproved=false,
  fetchImpl=fetch,setTimer=setInterval,clearTimer=clearInterval,
  endpoint=COORDINATOR_ENDPOINT,qaOnly=false,
}){
  const qaEndpointAllowed=qaOnly===true &&
    process.env.INGESTION_V2_QA_MODE==="true" &&
    process.env.GITHUB_ACTIONS==="true" &&
    process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    ( /^http:\/\/(?:127\.0\.0\.1|localhost):[1-9][0-9]{1,4}\/api\/ingestion-coordinator$/.test(endpoint) ||
      /^https:\/\/[a-z0-9-]*qa[a-z0-9-]*\.[a-z0-9-]+\.workers\.dev\/api\/ingestion-coordinator$/i.test(endpoint) );
  if((endpoint!==COORDINATOR_ENDPOINT&&!qaEndpointAllowed)||
    typeof token!=="string"||token.length<24||
    typeof rootId!=="string"||!/^[-A-Za-z0-9_]{10,128}$/.test(rootId)||
    typeof runId!=="string"||!/^[1-9][0-9]{5,19}$/.test(runId)||
    !/^[1-9][0-9]{0,5}$/.test(String(runAttempt)))
    throw Error("D1_COORDINATOR_INVALID_EXECUTION_CONTEXT");
  validateCoordinatorState(legacyState,rootId);
  const jobKey="drive:"+rootId;
  const unique=createHash("sha256").update(runId+":"+runAttempt).digest("hex").slice(0,24);
  const owner=`gh-${runId}-${unique}`;
  let lease=null,checkpointVersion=0,heartbeat=null,lost=false,closed=false;
  async function request(action,fields={}){
    let response;
    try{
      response=await fetchImpl(endpoint,{
        method:"POST",headers:{"Content-Type":"application/json",
          Authorization:"Bearer "+token},
        body:JSON.stringify({action,jobKey,...fields}),
        signal:AbortSignal.timeout(15_000),
      });
    }catch{throw Error("D1_COORDINATOR_TRANSPORT_FAILURE");}
    let payload;
    try{payload=await response.json();}catch{
      throw Error("D1_COORDINATOR_INVALID_RESPONSE");
    }
    if(!response.ok || payload?.ok!==true){
      // Do not put upstream response bodies/source paths into public Actions logs.
      const code=typeof payload?.error==="string"&&
          /^[A-Z0-9_]{4,85}$/.test(payload.error)?payload.error:
          "D1_COORDINATOR_REJECTED";
      throw Error(code);
    }
    return payload;
  }
  async function assertLive(){
    if(lost||closed||!lease)throw Error("D1_COORDINATOR_LEASE_LOST");
  }
  async function renew(){
    await assertLive();
    try{await request("renew",{lease,ttlMs:LEASE_TTL_MS});}
    catch{lost=true;throw Error("D1_COORDINATOR_LEASE_LOST");}
  }
  async function checkpoint(state){
    await assertLive();
    validateCoordinatorState(state,rootId);
    const result=await request("write_checkpoint",{
      lease,previousVersion:checkpointVersion,state,
    }).catch(()=>{
      lost=true;
      throw Error("D1_COORDINATOR_CHECKPOINT_CAS_FAILED");
    });
    if(result.version!==checkpointVersion+1||
       typeof result.checksum!=="string"||!/^[a-f0-9]{64}$/.test(result.checksum)){
      lost=true;
      throw Error("D1_COORDINATOR_CHECKPOINT_INTEGRITY_FAILED");
    }
    checkpointVersion=result.version;
    return result;
  }
  try{
    const claim=await request("claim",{owner,ttlMs:LEASE_TTL_MS});
    if(!claim.lease||claim.lease.jobKey!==jobKey||
       claim.lease.owner!==owner||
       !Number.isSafeInteger(claim.lease.generation)||
       claim.lease.generation<1)
      throw Error("D1_COORDINATOR_INVALID_CLAIM");
    lease=claim.lease;
    let recovered;
    try{
      const snapshot=await request("read_checkpoint",{lease});
      if(!Number.isSafeInteger(snapshot.version)||snapshot.version<1 ||
         typeof snapshot.checksum!=="string"||
         !/^[a-f0-9]{64}$/.test(snapshot.checksum))
         throw Error("D1_COORDINATOR_INVALID_CHECKPOINT_SNAPSHOT");
      recovered=validateCoordinatorState(snapshot.state,rootId);
      checkpointVersion=snapshot.version;
    }catch(error){
      if(error?.message!=="CHECKPOINT_NOT_FOUND_OR_LEASE_STALE"||!bootstrapApproved)
        throw error;
      // The error also represents a stale owner: reconfirm live ownership
      // before ever bootstrapping an absent D1 checkpoint.
      await renew();
      recovered=structuredClone(legacyState);
      await checkpoint(recovered);
    }
    heartbeat=setTimer(()=>{
      renew().catch(()=>{lost=true;});
    },HEARTBEAT_MS);
    heartbeat?.unref?.();
    return {
      state:recovered,
      get lease(){return lease;},
      get version(){return checkpointVersion;},
      get lost(){return lost;},
      checkpoint,assertLive,renew,
      async close(){
        if(closed)return;
        if(heartbeat!==null)clearTimer(heartbeat);
        closed=true;
        if(lease&&!lost){
          try{await request("release",{lease});}catch{/* lease expiry safe */}
        }
      },
    };
  }catch(error){
    if(heartbeat!==null)clearTimer(heartbeat);
    if(lease&&!lost){
      try{await request("release",{lease});}catch{/* owner may have expired */}
    }
    throw error;
  }
}
