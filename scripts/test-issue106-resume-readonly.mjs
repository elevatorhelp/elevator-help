import assert from "node:assert/strict";
import {verifyResumeRows} from "./qa-issue106-resume-readonly.mjs";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
const fp={A:"a".repeat(64),B:"b".repeat(64)};
const makeRow=(slot)=>{
 const id=QA106_PDFS[slot];
 const rec={v2SourceFingerprint:fp[slot],evidenceFingerprint:fp[slot],
   evidenceIds:["evidence-1","evidence-2"],
   extractionQuality:{status:"text_layer_complete"}};
 const state={version:3,scopes:{[QA106_ROOT]:{
   files:{[id]:{}},v2Files:{[id]:rec}
 }}};
 return {job_key:qa106JobKey(slot),version:5,
   checksum:"c".repeat(64),lease_until_ms:0,state_json:JSON.stringify(state)};
};
const baseline=[makeRow("A"),makeRow("B")];
const verify=rows=>verifyResumeRows(rows,fp,2_000_000_000_000);
assert.deepEqual(verify(baseline).map(x=>x.evidence),[true,true]);
const invalid=(rows,match)=>assert.throws(()=>verify(rows),match);
invalid([baseline[0]],/TWO_CHECKPOINTS_REQUIRED/);
invalid([baseline[0],baseline[0]],/JOB_KEY_MISMATCH/);
invalid([{...baseline[0],lease_until_ms:2_100_000_000_000},baseline[1]],/ACTIVE_LEASE/);
invalid([{...baseline[0],checksum:"bad"},baseline[1]],/CHECKPOINT_INVALID/);
const mutate=(slot,fn)=>{
 const rows=baseline.map(r=>structuredClone(r));
 const row=rows[slot==="A"?0:1], state=JSON.parse(row.state_json);
 fn(state.scopes[QA106_ROOT]);
 row.state_json=JSON.stringify(state);
 return rows;
};
invalid(mutate("A",s=>{s.v2Files[QA106_PDFS.A].evidenceIds=[];}),/EVIDENCE_NOT_DURABLE/);
invalid(mutate("A",s=>{s.v2Files[QA106_PDFS.A].rawFingerprint=fp.B;}),/REVISION_MISMATCH/);
invalid(mutate("B",s=>{s.files[QA106_PDFS.A]={};}),/CROSS_SCOPE_STATE/);
assert.throws(()=>verifyResumeRows(baseline,{A:fp.B,B:fp.B}),/EVIDENCE_NOT_DURABLE/);
console.log("PASS: Issue106 source-fingerprint, duplicate/missing checkpoint, lease, and stage-resume no-paid regression");
