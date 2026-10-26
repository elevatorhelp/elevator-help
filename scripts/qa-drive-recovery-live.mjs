import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const base=process.env.QA_APP_BASE_URL,token=process.env.QA_INGESTION_TOKEN;
if(!base||!token)throw Error("QA_PARAMETERS_MISSING");
// This script stages evidence and mutates a D1 lease. Never send its bearer
// token to production, a lookalike hostname, a redirect, or an arbitrary URL.
const approvedOrigin="https://elevator-help-pr61-app-qa.baharmand.workers.dev";
let target;
try { target=new URL(base); } catch { throw Error("QA_ISOLATED_ORIGIN_REQUIRED"); }
if(target.origin!==approvedOrigin||target.href!==approvedOrigin+"/")
  throw Error("QA_ISOLATED_ORIGIN_REQUIRED");
const runId=process.env.GITHUB_RUN_ID;
const attempt=process.env.GITHUB_RUN_ATTEMPT||"1";
if(!/^[1-9]\\d{0,19}$/.test(runId||"")||!/^[1-9]\\d{0,5}$/.test(attempt))
  throw Error("QA_UNIQUE_RUN_ID_REQUIRED");
const id="qa-resume-"+runId+"-"+attempt;
const ownerA="qa-recover-a",ownerB="qa-recover-b",fingerprint="revision-a";
async function post(body){
 const response=await fetch(new URL("/api/drive-ingest-batch",target),{
 method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
 body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(30000)});
 return {status:response.status,...await response.json()};
}
let r=await post({action:"lease_claim",documentId:id,owner:ownerA,durationMs:30000});
assert.equal(r.status,200,"initial lease claim");
const staleLease=r.lease;
const chunk={id:id+":c1",text:"Recovery synthetic E16 elevator technical test evidence.",sourceFileId:id,
fileName:"qa-restart.txt",sourcePath:"qa/recovery",page:1,chunkIndex:0,sourceFingerprint:fingerprint};
r=await post({action:"index_evidence",lease:staleLease,chunks:[chunk]});
assert.equal(r.status,200,"stage partial evidence");
r=await post({action:"publish_full",lease:staleLease,documentId:id,sourceFingerprint:fingerprint,
rawIds:[chunk.id],evidenceIds:[chunk.id],mapIds:[]});
assert.equal(r.status,409,"partial document cannot publish");
const q=(str)=>"'"+str.replaceAll("'","''")+"'";
const sql="UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key="+q(id);
execFileSync("npx",["wrangler","d1","execute","elevator-help-lease-test-01",
"--remote","--config","wrangler.qa-app-deployed.json","--command",sql],{
encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]});
r=await post({action:"lease_claim",documentId:id,owner:ownerB,durationMs:180000});
assert.equal(r.status,200,"new lease takes over expired worker");
assert.equal(r.lease.generation,staleLease.generation+1);
const newLease=r.lease;
r=await post({action:"lease_renew",lease:staleLease,durationMs:180000});
assert.equal(r.status,409,"stale worker cannot renew");
r=await post({action:"publish_full",lease:staleLease,documentId:id,
sourceFingerprint:fingerprint,rawIds:[chunk.id],evidenceIds:[chunk.id],mapIds:[]});
assert.equal(r.status,409,"stale worker cannot publish");
r=await post({action:"index_evidence",lease:newLease,chunks:[chunk]});
assert.equal(r.status,200,"new worker can replay immutable evidence in fresh generation");
console.log("PASS: interrupted document never published; expired lease reclaimed; stale owner fenced; new generation resumed staging");
