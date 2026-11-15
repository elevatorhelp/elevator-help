/**
 * Issue106: seed or attest ONE dedicated QA worker's D1 checkpoint.
 * Shared QA Drive root, but distinct immutable job keys and distinct PDFs.
 */
import {randomBytes} from "node:crypto";
import {
  QA106_ROOT,QA106_PDFS,QA106_CONFIRM,QA106_PORTS,
  qa106JobKey,assertQa106ParallelContext
} from "./qa-issue106-parallel-guard.mjs";
import {validateCoordinatorState} from "./ingestion-coordinator-client.mjs";
import {
  buildQaImmutableManifest,assertQaImmutablePublish
} from "./ingestion-v2-qa-guard.mjs";
const mode=process.argv[2];
const slot=process.env.INGESTION_V2_QA_PARALLEL_SLOT;
const token=process.env.QA_V2_INGESTION_TOKEN;
const job=slot==="A"||slot==="B"?qa106JobKey(slot):"";
const id=slot==="A"||slot==="B"?QA106_PDFS[slot]:"";
const base=slot==="A"||slot==="B"?"http://127.0.0.1:"+QA106_PORTS[slot]+"/api/":"";
const owner="gh-"+String(process.env.GITHUB_RUN_ID||"")+"-"+randomBytes(12).toString("hex");
let lease=null;
const check=(yes,code)=>{if(!yes)throw Error(code);};
async function post(endpoint,body,allowed404=false){
 const res=await fetch(base+endpoint,{
  method:"POST",headers:{"Content-Type":"application/json",
  Authorization:"Bearer "+token},
  body:JSON.stringify(body),signal:AbortSignal.timeout(30000)
 });
 const data=await res.json().catch(()=>null);
 if(allowed404&&res.status===404&&
   data?.error==="CHECKPOINT_NOT_FOUND_OR_LEASE_STALE")return {missing:true};
 check(res.ok&&data?.ok===true,"QA106_COORDINATOR_OR_PUBLISH_REJECTED");
 return data;
}
const coord=(action,fields={},allowed404=false)=>
 post("ingestion-coordinator",{action,jobKey:job,...fields},allowed404);
function isolated(state){
 validateCoordinatorState(state,QA106_ROOT,{qaOnly:true});
 check(Object.keys(state.scopes).length===1&&
  Object.keys(state.scopes[QA106_ROOT].files).length===1&&
  Object.hasOwn(state.scopes[QA106_ROOT].files,id)&&
  state.scopes[QA106_ROOT].v2Files&&
  Object.keys(state.scopes[QA106_ROOT].v2Files).every(x=>x===id),
  "QA106_WORKER_STATE_CROSSED");
}
async function main(){
 check((mode==="seed"||mode==="attest")&&
   assertQa106ParallelContext(process.env)?.jobKey===job&&
   process.env.QA106_CONFIRMATION===QA106_CONFIRM&&
   typeof token==="string"&&token.length>=24&&
   /^[1-9][0-9]{5,19}$/.test(process.env.GITHUB_RUN_ID||""),
   "QA106_COORDINATOR_UNAPPROVED");
 const claim=await coord("claim",{owner,ttlMs:180000});
 lease=claim.lease;
 check(lease?.owner===owner&&lease.jobKey===job,"QA106_JOB_LEASE_UNAVAILABLE");
 let snapshot=await coord("read_checkpoint",{lease},true);
 if(snapshot.missing&&mode==="seed"){
   // A 404 could mean stale lease. Renew prior to the initial CAS write.
   await coord("renew",{lease,ttlMs:180000});
   const state={version:3,scopes:{[QA106_ROOT]:{
     files:{[id]:{}},v2Files:{}
   }}};
   isolated(state);
   const initial=await coord("write_checkpoint",{
     lease,previousVersion:0,state
   });
   check(initial.version===1,"QA106_INITIAL_CHECKPOINT_CAS_FAILED");
   snapshot=await coord("read_checkpoint",{lease});
 }
 check(!snapshot.missing&&Number.isSafeInteger(snapshot.version)&&
   snapshot.version>=1,"QA106_WORKER_CHECKPOINT_MISSING");
 isolated(snapshot.state);
 if(mode==="seed"){
   console.log("PASS: isolated D1 checkpoint exists and root+single-file scope verified for Worker "+slot);
   return;
 }
 const rec=snapshot.state.scopes[QA106_ROOT].v2Files[id];
 const fp=rec?.v2SourceFingerprint;
 check(rec&&typeof fp==="string"&&/^[a-f0-9]{64}$/.test(fp)&&
   rec.evidenceFingerprint===fp&&rec.rawFingerprint===fp&&
   rec.mapFingerprint===fp&&rec.publishedFingerprint===fp&&
   rec.publishedEpoch===rec.documentEpoch&&
   rec.extractionQuality?.status==="text_layer_complete",
   "QA106_FILE_NOT_PUBLISHED");
 const manifest=buildQaImmutableManifest(rec,fp);
 check(manifest&&manifest.evidenceIds.length>=2&&
   manifest.rawIds.length>=2&&manifest.mapIds.length>=1,
   "QA106_PHYSICAL_MANIFEST_INCOMPLETE");
 const proof=await post("immutable-archive-publish",{
   action:"verify_published",documentId:id,
   globalArchiveLease:lease,manifest
 });
 assertQaImmutablePublish(proof,rec.documentEpoch);
 console.log("PASS: Worker "+slot+" isolated PDF published exact Evidence+RAW+Map manifest in QA D1");
}
try{await main();}
catch(e){
 const m=String(e?.message||"");
 console.error("::error::"+(/^QA106_[A-Z0-9_]+$/.test(m)?m:"QA106_WORKER_COORDINATOR_ABORTED"));
 process.exitCode=1;
}finally{
 if(lease){try{await coord("release",{lease});}catch{}}
}
