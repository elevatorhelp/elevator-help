import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyParallelLeaseClaims} from './qa-pr61-parallel-lease-race.mjs';

function fakePost({bothWin=false,bothLose=false,loserRenews=false,loserPublishes=false}={}) {
 const owned=new Map();
 let claims=0;
 return async body=>{
   if(body.action==='lease_claim'){
     claims++;
     const exists=owned.get(body.documentId);
     if(bothLose)return {status:409};
     if(exists&&!bothWin)return {status:409};
     const lease={jobKey:body.documentId,owner:body.owner,generation:1};
     if(!exists)owned.set(body.documentId,lease);
     return {status:200,lease};
   }
   if(body.action==='lease_renew'){
     const current=owned.get(body.lease.jobKey);
     if(current?.owner===body.lease.owner)return {status:200,renewed:true};
     return {status:loserRenews?200:409};
   }
   if(body.action==='publish_staged'){
     const current=owned.get(body.documentId);
     if(current?.owner!==body.lease.owner)return {status:loserPublishes?200:409};
     return {status:409};
   }
   throw Error('Unexpected QA action');
 };
}
assert.equal(await verifyParallelLeaseClaims(fakePost(),'12345-1'),
 'QA_PARALLEL_LEASE_CLAIM_FENCING_VERIFIED');
for(const opts of [
 {bothWin:true},{bothLose:true},{loserRenews:true},{loserPublishes:true},
]){
 await assert.rejects(verifyParallelLeaseClaims(fakePost(opts),'12345-1',{rounds:1}),
   /QA_PARALLEL_|Expected values to be strictly equal/);
}
const bad=async()=>({status:409});
for(const id of ['abc','12345/1','12345-','12345-0']){
 await assert.rejects(verifyParallelLeaseClaims(bad,id),/The input did not match the regular expression/);
}
const source=readFileSync(new URL('./qa-pr61-parallel-lease-race.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/fetch\s*\(|upsert|index_evidence|Gemini|deleteByIds/,
  'concurrent lease probe cannot make paid model calls or vector writes');
const real=readFileSync(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');
assert.ok(real.includes("verifyParallelLeaseClaims(post,run)"),
 'real isolated OpenNext E2E must exercise actual remote simultaneous claims');
assert.ok(real.indexOf("verifyParallelLeaseClaims(post,run)")<real.indexOf("if (process.env.QA_NEGATIVE_ONLY"),
 'no-Gemini QA variant must still check real D1 claim concurrency');
console.log('PASS: two distinct QA clients race D1 lease, loser cannot renew or publish; regression rejects dual grants without invoking Gemini');
