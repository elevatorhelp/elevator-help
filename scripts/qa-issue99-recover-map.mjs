/**
 * One-document QA-only late Vectorize readback recovery. NO Gemini calls.
 * Reattests pre-existing, immutable dual-index map physical IDs by the
 * existing stage_vector + D1 CAS endpoint. Never bypasses the live lease.
 */
import {readFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {
  validateCoordinatorState
} from "./ingestion-coordinator-client.mjs";
import {
  buildQaImmutableManifest,assertQaImmutablePublish
} from "./ingestion-v2-qa-guard.mjs";
const ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const FILE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const JOB="drive:"+ROOT;
const BRANCH="refs/heads/qa/issue99-late-map-recovery-20261115";
const BASE="http://127.0.0.1:8787/api/";
const TOKEN=process.env.QA_V2_INGESTION_TOKEN;
const run=process.env.GITHUB_RUN_ID||"";
const owner="gh-"+run+"-"+randomBytes(12).toString("hex");
let lease=null;
const deny=(ok,code)=>{if(!ok)throw Error(code);};
async function call(route,payload){
 let response;
 try{response=await fetch(BASE+route,{
  method:"POST",headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)
 });}catch{throw Error("QA_RECOVERY_WORKER_TRANSPORT_FAILED");}
 const result=await response.json().catch(()=>null);
 deny(response.ok&&result?.ok===true,"QA_RECOVERY_WORKER_REJECTED_REQUEST");
 return result;
}
const coord=(action,other={})=>call("ingestion-coordinator",{action,jobKey:JOB,...other});
async function main(){
 deny(process.env.GITHUB_ACTIONS==="true"&&
   process.env.GITHUB_EVENT_NAME==="push"&&
   process.env.GITHUB_REF===BRANCH&&
   process.env.QA_RECOVERY_CONFIRMATION==="QA_ONLY_REUSE_EXISTING_MAP_NO_GEMINI"&&
   process.env.QA_V2_JOB_KEY===JOB&&
   typeof TOKEN==="string"&&TOKEN.length>=24&&
   /^[1-9][0-9]{5,19}$/.test(run),
   "QA_RECOVERY_UNAPPROVED_CONTEXT");
 const path=process.env.RUNNER_TEMP+"/qa-issue99-map-recovery-private.json";
 const packet=JSON.parse(await readFile(path,"utf8"));
 deny(packet.documentId===FILE&&Array.isArray(packet.records)&&packet.records.length===2,
   "QA_RECOVERY_PRIVATE_INPUT_UNSAFE");
 const result=await coord("claim",{owner,ttlMs:180000});
 lease=result.lease;
 deny(lease?.owner===owner&&lease.jobKey===JOB,
   "QA_RECOVERY_D1_OWNER_DENIED");
 let snapshot=await coord("read_checkpoint",{lease});
 deny(snapshot.version>=1&&Number.isSafeInteger(snapshot.version),
   "QA_RECOVERY_D1_CHECKPOINT_MISSING");
 const state=validateCoordinatorState(snapshot.state,ROOT,{qaOnly:true});
 deny(Object.keys(state.scopes).length===1&&
   Object.keys(state.scopes[ROOT].files).length===1&&
   Object.hasOwn(state.scopes[ROOT].files,FILE),
   "QA_RECOVERY_D1_SCOPE_NOT_ISOLATED");
 const rec=state.scopes[ROOT].v2Files?.[FILE];
 deny(rec&&typeof rec==="object"&&!Array.isArray(rec),
   "QA_RECOVERY_D1_PDF_NOT_INDEXED");
 const fp=rec.v2SourceFingerprint;
 const epoch=rec.documentEpoch;
 deny(typeof fp==="string"&&/^[a-f0-9]{64}$/.test(fp)&&
   Number.isSafeInteger(epoch)&&epoch>0&&
   rec.evidenceFingerprint===fp && rec.rawFingerprint===fp &&
   rec.extractionQuality?.status==="text_layer_complete" &&
   Array.isArray(rec.evidenceIds)&&rec.evidenceIds.length===2 &&
   Array.isArray(rec.ids)&&rec.ids.length===2,
   "QA_RECOVERY_D1_EVIDENCE_RAW_NOT_READY");
 deny(!rec.publishedFingerprint && !rec.mapFingerprint,
   "QA_RECOVERY_ALREADY_PUBLISHED_OR_MAP_COMPLETE");
 const originalIds=[];
 for(const item of packet.records){
  deny(item.sourceFingerprint===fp&&item.documentEpoch===epoch&&
   item.metadata?.sourceFileId===FILE&&
   item.metadata?.sourceFingerprint===fp&&
   item.metadata?.stagedGeneration===epoch&&
   item.metadata?.stagedLayer==="map"&&
   item.metadata?.status==="active"&&
   item.metadata?.contentType==="document-map"&&
   /^v2m-[0-9a-z]+-[a-f0-9]{40}$/.test(item.stagedId)&&
   /^map-[a-f0-9]{40}$/.test(item.logicalId)&&
   item.metadata?.page>=1&&item.metadata?.pageEnd>=item.metadata?.page&&
   item.metadata?.mapVersion===4&&
   item.legacyValues?.length===768&&item.multilingualValues?.length===768,
   "QA_RECOVERY_REVISION_OR_LAYER_MISMATCH");
  originalIds.push(item.stagedId);
 }
 deny(new Set(originalIds).size===2,
   "QA_RECOVERY_DUPLICATED_MAP_IDS");
 // No model call, no unversioned writes, no deletion. The existing
 // immutable stage endpoint checks owner/epoch and rechecks BOTH indexes.
 for(const item of packet.records){
  const receipt=await call("immutable-archive-publish",{
    action:"stage_vector",documentId:FILE,
    layer:"map",
    record:{
      logicalId:item.logicalId,sourceFingerprint:fp,
      metadata:item.metadata,
      legacyValues:item.legacyValues,
      multilingualValues:item.multilingualValues,
    },
    globalArchiveLease:lease,
  });
  deny(receipt.stagedId===item.stagedId &&
    receipt.documentEpoch===epoch&&receipt.published===false,
    "QA_RECOVERY_RECEIPT_RECONCILIATION_FAILED");
 }
 console.log("PASS: existing Gemini-generated Map vectors received D1 receipts (no Gemini calls)");
 rec.mapIds=originalIds;
 rec.mapVersion=4;
 rec.mapFingerprint=fp;
 rec.mapIndexedAt=new Date().toISOString();
 delete rec.partialMapIds;
 delete rec.partialMapVersion;
 delete rec.partialMapFingerprint;
 delete rec.mapNextPage;
 delete rec.mapProgressAt;
 snapshot=await coord("write_checkpoint",{
   lease,previousVersion:snapshot.version,state
 });
 deny(snapshot.version>=2,"QA_RECOVERY_CHECKPOINT_CAS_FAILED");
 console.log("PASS: map recovery committed to authoritative QA D1 checkpoint");
 const manifest=buildQaImmutableManifest(rec,fp);
 deny(manifest && manifest.mapIds.length===2&&
  manifest.rawIds.length===2&&manifest.evidenceIds.length===2,
  "QA_RECOVERY_THREE_LAYER_MANIFEST_INCOMPLETE");
 const published=await call("immutable-archive-publish",{
   action:"publish",documentId:FILE,
   manifest,globalArchiveLease:lease
 });
 assertQaImmutablePublish(published,epoch);
 rec.publishedFingerprint=fp;
 rec.publishedEpoch=epoch;
 rec.fingerprint=fp;
 rec.indexedAt=new Date().toISOString();
 const complete=await coord("write_checkpoint",{
   lease,previousVersion:snapshot.version,state
 });
 deny(complete.version===snapshot.version+1,
   "QA_RECOVERY_PUBLISHED_CHECKPOINT_DENIED");
 const proof=await call("immutable-archive-publish",{
   action:"verify_published",documentId:FILE,
   manifest,globalArchiveLease:lease
 });
 assertQaImmutablePublish(proof,epoch);
 console.log("PASS: 2-page real Drive Evidence + RAW + Map immutable CAS publication attested in QA D1");
 console.log("QA_REAL_DRIVE_V2_PUBLICATION_PASS_NO_ADDITIONAL_GEMINI");
}
try{await main();}
catch(e){
 const m=String(e?.message||"");
 console.error("::error::"+(/^QA_RECOVERY_[A-Z0-9_]+$/.test(m)?
   m:"QA_RECOVERY_ABORTED_NO_PUBLICATION_ATTESTATION"));
 process.exitCode=1;
}finally{
 if(lease){
  try{await coord("release",{lease});}catch{/* lease auto expires */}
 }
}
