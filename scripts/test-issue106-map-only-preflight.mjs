import assert from "node:assert/strict";
import {verifyMapOnlyPreflight} from "./qa-issue106-map-only-preflight.mjs";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";

const fp="a".repeat(64);
const checkpoint=slot=>({
 job_key:qa106JobKey(slot),
 version:11,
 checksum:"b".repeat(64),
 lease_until_ms:0,
 state_json:JSON.stringify({
   version:3,
   scopes:{[QA106_ROOT]:{
     files:{[QA106_PDFS[slot]]:{}},
     v2Files:{[QA106_PDFS[slot]]:{
       v2SourceFingerprint:fp,evidenceFingerprint:fp,
       rawFingerprint:fp,documentEpoch:1,
       evidenceIds:["E1","E2"],ids:["R1","R2"],
     }}
   }}
 })
});
const receipt=slot=>({
 slot,epoch_present:1,evidence_current:2,raw_current:2,
 map_current:slot==="A"?1:0,raw_all_epochs:2,
 pending_map_windows:1,published_count:0,
});
const cps=[checkpoint("A"),checkpoint("B")];
const rcs=[receipt("A"),receipt("B")];
const validate=(x=cps,y=rcs)=>verifyMapOnlyPreflight(x,y,2000000000000);
assert.equal(validate().length,2);
assert.equal(validate()[0].map,1);
assert.equal(validate()[1].map,0);
const mutation=(slot,callback)=>{
 const v=structuredClone(cps);
 const idx=slot==="A"?0:1,st=JSON.parse(v[idx].state_json);
 callback(st.scopes[QA106_ROOT].v2Files[QA106_PDFS[slot]]);
 v[idx].state_json=JSON.stringify(st);
 return v;
};
assert.throws(()=>validate([cps[0]]),/CHECKPOINT_ROWS_INVALID/);
assert.throws(()=>validate([cps[0],cps[0]]),/JOB_SCOPE_INVALID/);
assert.throws(()=>validate([{...cps[0],lease_until_ms:2000000000001},cps[1]]),/ACTIVE_WRITER/);
assert.throws(()=>validate(mutation("A",v=>v.rawFingerprint="c".repeat(64))),/NOT_PENDING_AT_MAP/);
assert.throws(()=>validate(mutation("A",v=>v.mapFingerprint=fp)),/NOT_PENDING_AT_MAP/);
assert.throws(()=>validate(mutation("B",v=>v.publishedFingerprint=fp)),/NOT_PENDING_AT_MAP/);
assert.throws(()=>validate(cps,rcs.map((r,i)=>i===1?{...r,pending_map_windows:0}:r)),/RECEIPTS_INCOMPLETE/);
assert.throws(()=>validate(cps,rcs.map((r,i)=>i===1?{...r,published_count:1}:r)),/RECEIPTS_INCOMPLETE/);
assert.throws(()=>validate(cps,rcs.map((r,i)=>i===0?{...r,raw_current:1}:r)),/RECEIPTS_INCOMPLETE/);
assert.ok(!JSON.stringify(validate()).includes(QA106_PDFS.A));
console.log("PASS: Issue106 Map-only preflight requires two exact isolated RAW-complete D1 checkpoints and pending immutable Map intents");
