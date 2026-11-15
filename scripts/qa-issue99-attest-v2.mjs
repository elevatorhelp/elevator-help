/**
 * Read-only attestation of a full real-Drive immutable PDF publication.
 * Uses D1 source checkpoint, physical staged IDs and exact published CAS.
 */
import {randomBytes} from "node:crypto";
import {buildQaImmutableManifest,assertQaImmutablePublish} from "./ingestion-v2-qa-guard.mjs";
import {validateCoordinatorState} from "./ingestion-coordinator-client.mjs";
const ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const FIXTURE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const ORIGIN="http://127.0.0.1:8787";
const JOB="drive:"+ROOT;
const run=process.env.GITHUB_RUN_ID||"";
const owner="gh-"+run+"-"+randomBytes(12).toString("hex");
const token=process.env.QA_V2_INGESTION_TOKEN;
let lease=null;
function check(v,code){if(!v)throw Error(code);}
async function req(path,payload){
  let response;
  try{
    response=await fetch(ORIGIN+path,{
      method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)
    });
  }catch{throw Error("QA_ATTESTATION_TRANSPORT_UNAVAILABLE");}
  const body=await response.json().catch(()=>null);
  check(response.ok && body?.ok===true,"QA_ATTESTATION_ENDPOINT_REJECTED");
  return body;
}
const coord=(action,extra={})=>req("/api/ingestion-coordinator",{action,jobKey:JOB,...extra});
async function main(){
  check(process.env.GITHUB_ACTIONS==="true"&&
    process.env.GITHUB_REF==="refs/heads/main" &&
    process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    process.env.QA_V2_JOB_KEY===JOB &&
    typeof token==="string"&&token.length>=24,
    "QA_ATTESTATION_UNAPPROVED");
  const claim=await coord("claim",{owner,ttlMs:180000});
  lease=claim.lease;
  check(lease?.owner===owner&&lease.jobKey===JOB,"QA_ATTESTATION_LEASE_DENIED");
  const snapshot=await coord("read_checkpoint",{lease});
  check(Number.isSafeInteger(snapshot.version)&&snapshot.version>=4,
    "QA_ATTESTATION_CHECKPOINT_NOT_ADVANCED");
  const state=validateCoordinatorState(snapshot.state,ROOT,{qaOnly:true});
  const record=state.scopes?.[ROOT]?.v2Files?.[FIXTURE];
  check(record&&typeof record==="object","QA_ATTESTATION_PDF_CHECKPOINT_ABSENT");
  const fp=record.v2SourceFingerprint;
  check(typeof fp==="string"&&/^[a-f0-9]{64}$/.test(fp) &&
    record.publishedFingerprint===fp &&
    record.publishedEpoch===record.documentEpoch &&
    record.extractionQuality?.status==="text_layer_complete",
    "QA_ATTESTATION_PDF_NOT_PUBLISHED");
  const manifest=buildQaImmutableManifest(record,fp);
  check(manifest && manifest.evidenceIds.length>=2 &&
    manifest.rawIds.length>=2 && manifest.mapIds.length>=1,
    "QA_ATTESTATION_INCOMPLETE_PHYSICAL_MANIFEST");
  console.log("PASS: authoritative D1 checkpoint contains all PDF pages and three immutable layers");
  const proof=await req("/api/immutable-archive-publish",{
    action:"verify_published",documentId:FIXTURE,
    manifest,globalArchiveLease:lease
  });
  assertQaImmutablePublish(proof,record.documentEpoch);
  console.log("PASS: remote D1 published generation matches exact physical RAW/Map and Evidence manifest");
  console.log("QA_REAL_DRIVE_V2_PUBLICATION_PASS");
}
try{await main();}
catch(error){
  const m=String(error?.message||"");
  console.error("::error::"+(/^QA_[A-Z0-9_]{4,100}$/.test(m)?m:"QA_ATTESTATION_FAILED"));
  process.exitCode=1;
}finally{
  if(lease){
    try{await coord("release",{lease});}catch{/* owner lease expires */}
  }
}
