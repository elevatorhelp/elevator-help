/**
 * Controlled one-time QA D1 checkpoint seeding via the actual coordinator CAS.
 * Only run from manual GitHub workflow; no reset or overwrite of existing state.
 */
import {randomBytes} from "node:crypto";
import {validateCoordinatorState} from "./ingestion-coordinator-client.mjs";

const ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const FIXTURE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const JOB="drive:"+ROOT;
const TOKEN=process.env.QA_V2_INGESTION_TOKEN;
const BASE="http://127.0.0.1:8787/api/ingestion-coordinator";
const run=process.env.GITHUB_RUN_ID||"";
const owner="gh-"+run+"-"+randomBytes(12).toString("hex");
let lease;
function require_(yes,code){if(!yes)throw Error(code);}
async function call(action,fields={}){
  const response=await fetch(BASE,{
    method:"POST",
    headers:{"Authorization":"Bearer "+TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({action,jobKey:JOB,...fields}),
    signal:AbortSignal.timeout(18000)
  });
  const data=await response.json();
  return {status:response.status,...data};
}
function validate(state){
  validateCoordinatorState(state,ROOT,{qaOnly:true});
  require_(Object.keys(state.scopes).length===1 &&
    Object.hasOwn(state.scopes[ROOT].files,FIXTURE) &&
    Object.keys(state.scopes[ROOT].files).length===1 &&
    state.scopes[ROOT].v2Files &&
    typeof state.scopes[ROOT].v2Files==="object" &&
    !Array.isArray(state.scopes[ROOT].v2Files),
    "QA_D1_ROOT_STATE_NOT_ISOLATED");
}
async function main(){
  require_(process.env.GITHUB_ACTIONS==="true" &&
    process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    process.env.GITHUB_REF==="refs/heads/main" &&
    /^[1-9][0-9]{5,19}$/.test(run) &&
    process.env.QA_V2_JOB_KEY===JOB &&
    process.env.QA_V2_SEED_CONFIRMATION==="QA_ONLY_ONE_PDF_MAX_12_GEMINI_CALLS" &&
    typeof TOKEN==="string" && TOKEN.length>=24,
    "QA_D1_UNAPPROVED_SEED_CONTEXT");
  const result=await call("claim",{owner,ttlMs:180000});
  require_(result.ok===true && result.lease?.jobKey===JOB &&
    result.lease.owner===owner,"QA_D1_LEASE_NOT_GRANTED");
  lease=result.lease;
  let snapshot=await call("read_checkpoint",{lease});
  if(snapshot.status===404 && snapshot.error==="CHECKPOINT_NOT_FOUND_OR_LEASE_STALE"){
    // 404 can also indicate a lost lease. Prove owner is still live.
    const renewal=await call("renew",{lease,ttlMs:180000});
    require_(renewal.ok===true,"QA_D1_LEASE_LOST");
    const seed={
      version:3,
      scopes:{[ROOT]:{files:{[FIXTURE]:{}},v2Files:{}}}
    };
    validate(seed);
    const created=await call("write_checkpoint",{
      lease,previousVersion:0,state:seed
    });
    require_(created.ok===true && created.version===1,
      "QA_D1_INITIAL_CHECKPOINT_DENIED");
    console.log("PASS: initialized isolated QA root checkpoint via D1 CAS");
    snapshot=await call("read_checkpoint",{lease});
  }
  require_(snapshot.ok===true && Number.isSafeInteger(snapshot.version) &&
    snapshot.version>=1,"QA_D1_CHECKPOINT_UNREADABLE");
  validate(snapshot.state);
  console.log("PASS: validated existing QA-only root-scoped D1 checkpoint");
}
try{await main();}
catch(error){
  const m=String(error?.message||"");
  console.error("::error::"+(/^QA_[A-Z_]{4,100}$/.test(m)?m:"QA_D1_SEED_FAILED"));
  process.exitCode=1;
}finally{
  if(lease){
    try{await call("release",{lease});}catch{/* lease expires */}
  }
}
