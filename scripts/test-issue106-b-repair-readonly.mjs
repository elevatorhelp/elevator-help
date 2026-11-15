import assert from "node:assert/strict";
import {verifyBRepairReadOnly} from "./qa-issue106-b-repair-readonly.mjs";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";

const fp="a".repeat(64);
const cp=slot=>{
 const doc=QA106_PDFS[slot];
 const rec={
   v2SourceFingerprint:fp,evidenceFingerprint:fp,rawFingerprint:fp,
   documentEpoch:2,evidenceIds:["e1","e2"],ids:["r1","r2"],
 };
 if(slot==="A")Object.assign(rec,{
   mapFingerprint:fp,publishedFingerprint:fp,publishedEpoch:2,
   mapIds:["m1","m2"],
 });
 return {job_key:qa106JobKey(slot),version:14,checksum:"b".repeat(64),
   lease_until_ms:0,state_json:JSON.stringify({version:3,scopes:{
     [QA106_ROOT]:{files:{[doc]:{}},v2Files:{[doc]:rec}},
   }})};
};
const row=slot=>({slot,epoch_present:1,evidence_current:2,raw_current:2,
  map_current:slot==="A"?2:1,raw_all_epochs:2,
  pending_map_windows:1,published_count:slot==="A"?1:0});
const checkpoints=[cp("A"),cp("B")],receipts=[row("A"),row("B")];
assert.deepEqual(verifyBRepairReadOnly(checkpoints,receipts,2e12)
  .map(x=>[x.slot,x.published]),[["A",true],["B",false]]);
assert.throws(()=>verifyBRepairReadOnly([cp("B")],receipts,2e12),
 /CHECKPOINTS_MISSING/);
assert.throws(()=>verifyBRepairReadOnly([cp("B"),cp("B")],receipts,2e12),
 /SCOPE_MISMATCH/);
assert.throws(()=>verifyBRepairReadOnly([
 {...cp("A"),lease_until_ms:2e12+1},cp("B")],receipts,2e12),/ACTIVE_LEASE/);
assert.throws(()=>verifyBRepairReadOnly(checkpoints,[
 {...receipts[0],published_count:0},receipts[1]],2e12),/A_NOT_PUBLISHED/);
assert.throws(()=>verifyBRepairReadOnly(checkpoints,[
 receipts[0],{...receipts[1],map_current:2}],2e12),/B_NOT_EXACTLY_ONE_MISSING/);
assert.throws(()=>verifyBRepairReadOnly(checkpoints,[
 receipts[0],{...receipts[1],raw_current:1}],2e12),/RAW_EVIDENCE_NOT_COMPLETE/);
assert.throws(()=>verifyBRepairReadOnly(checkpoints,[
 receipts[0],{...receipts[1],published_count:1}],2e12),/B_NOT_EXACTLY_ONE_MISSING/);
assert.ok(!JSON.stringify(verifyBRepairReadOnly(checkpoints,receipts,2e12))
 .includes(QA106_PDFS.B));
console.log("PASS: B Map paid repair blocked unless A is published, B exactly 1/2 Map and both leases inactive");
