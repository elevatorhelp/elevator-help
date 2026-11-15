import assert from "node:assert/strict";
import {summarizeQa106D1} from "./qa-issue106-d1-readonly-diagnostic.mjs";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
const fp="a".repeat(64);
const fake=slot=>{
 const id=QA106_PDFS[slot];
 return {job_key:qa106JobKey(slot),version:7,lease_until_ms:0,
 state_json:JSON.stringify({version:3,scopes:{
 [QA106_ROOT]:{v2LastSelectedPhase:"raw",files:{[id]:{}},
 v2Files:{[id]:{v2SourceFingerprint:fp,evidenceFingerprint:fp,
   partialRawIds:["sensitive-vector-id"],rawNextChunk:2}}}}})};
};
const x=summarizeQa106D1([fake("A"),fake("B")],2e12);
assert.equal(x.length,2);
assert.equal(x[0].evidence,true);
assert.equal(x[0].raw,false);
assert.equal(x[0].partialRawCount,1);
assert.equal(x[0].rawNextChunk,2);
assert.equal(x[0].activeLease,false);
assert.ok(!JSON.stringify(x).includes("sensitive-vector-id"));
const active=structuredClone(fake("A"));active.lease_until_ms=2e12+1;
assert.equal(summarizeQa106D1([active,fake("B")],2e12)[0].activeLease,true);
const missing=summarizeQa106D1([fake("A")],2e12);
assert.equal(missing[1].state,"missing_or_duplicate");
console.log("PASS: QA106 D1 read-only diagnostics only disclose bounded stage statuses and counts");
