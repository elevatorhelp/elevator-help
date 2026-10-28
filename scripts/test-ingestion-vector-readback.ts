import assert from "node:assert/strict";
import {hasExactStagedVectorReadback as ready,hasBoundedFullPublicationManifest as bounded,hasBoundedRawPublicationManifest as rawBounded,hasReadyRawStagedVectors as rawReady,MAX_FULL_PUBLICATION_VECTOR_READBACK_IDS as MAX_IDS} from "../app/lib/ingestion-vector-readback.ts";
const ids=["g2:raw-1","g2:map-1"];
const current=ids.map(id=>({id,metadata:{sourceFileId:"doc-1",sourceFingerprint:"revision-new"}}));
const old=ids.map(id=>({id,metadata:{sourceFileId:"doc-1",sourceFingerprint:"revision-old"}}));
// Both physical indices must independently prove the exact source revision.
for(const index of [current,structuredClone(current)])
  assert.equal(ready(index,ids,"doc-1","revision-new"),true);
// D1 restore can reuse generation 2 while old Vectorize g2 IDs still exist.
// ID-only readiness would incorrectly accept those stale vectors.
for(const index of [old,structuredClone(old)])
  assert.equal(ready(index,ids,"doc-1","revision-new"),false,
    "stale revision must block publication in either physical index");
assert.equal(ready([current[0],old[1]],ids,"doc-1","revision-new"),false);
assert.equal(ready([{...current[0],metadata:{sourceFileId:"doc-2",sourceFingerprint:"revision-new"}},current[1]],ids,"doc-1","revision-new"),false);
assert.equal(ready([{id:ids[0]},current[1]],ids,"doc-1","revision-new"),false);
assert.equal(ready([current[0]],ids,"doc-1","revision-new"),false);
assert.equal(ready([...current,current[0]],ids,"doc-1","revision-new"),false);
assert.equal(ready([...current,{id:"g2:unexpected",metadata:current[0].metadata}],ids,"doc-1","revision-new"),false);
assert.equal(ready(current,[ids[0],ids[0]],"doc-1","revision-new"),false);
assert.equal(ready(current,ids,"doc-1",""),false);
assert.equal(ready(null,ids,"doc-1","revision-new"),false);
// Cost and safety: malformed/oversized manifests must be rejected before remote
// dual-index getByIds, not only after reads at the D1 CAS boundary.
assert.equal(bounded(["raw"],["evidence"],["map"],"revision-new"),true);
for(const args of [
  [[],["evidence"],["map"],"revision-new"],
  [["raw"],[],["map"],"revision-new"],
  [["raw"],["evidence"],[],"revision-new"],
  [["raw","raw"],["evidence"],["map"],"revision-new"],
  [["raw"],["evidence"],["raw"],"revision-new"],
  [["raw"],["evidence"],["map"]," "],
  [["raw"],["evidence"],["map"],"x".repeat(513)],
  [[null],["evidence"],["map"],"revision-new"],
  [[" "],["evidence"],["map"],"revision-new"],
  [["x".repeat(513)],["evidence"],["map"],"revision-new"],
  [Array.from({length:MAX_IDS},(_,i)=>"raw-"+i),["evidence"],["map"],"revision-new"],
  [Array.from({length:MAX_IDS+1},(_,i)=>"raw-"+i),["evidence"],["map"],"revision-new"],
  [["raw"],Array.from({length:MAX_IDS+1},(_,i)=>"e-"+i),["map"],"revision-new"],
]) { const [raw,evidence,map,fp]=args; assert.equal(bounded(raw,evidence,map,fp),false,"unsafe publication manifest must fail before Vectorize reads"); }
assert.equal(bounded(Array.from({length:MAX_IDS-1},(_,i)=>"r-"+i),["e"],["m"],"fp"),true);
console.log("PASS: dual staged Vectorize readbacks require exact document/revision metadata");


// Regression: RAW-only publish_staged previously activated D1 receipts without
// checking that either physical Vectorize index could read the staged vectors.
const rawIds=Array.from({length:21},(_,i)=>"raw-"+i);
const goodIndex=()=>({getByIds:async (requested:string[])=>requested.map(id=>({
 id,metadata:{sourceFileId:"doc-1",sourceFingerprint:"revision-new"}
}))});
const staleIndex=()=>({getByIds:async (requested:string[])=>requested.map(id=>({
 id,metadata:{sourceFileId:"doc-1",sourceFingerprint:"revision-old"}
}))});
assert.equal(rawBounded(rawIds,2,"doc-1","revision-new"),true);
let readCalls=0;
const counted=()=>({getByIds:async (requested:string[])=>{
 readCalls++;
 return goodIndex().getByIds(requested);
}});
assert.equal(await rawReady([counted(),counted()],rawIds,2,"doc-1","revision-new"),true);
assert.equal(readCalls,4,"21 IDs require two pages in each of two physical indices");
assert.equal(await rawReady([goodIndex(),staleIndex()],rawIds,2,"doc-1","revision-new"),false,
 "a stale second index must block RAW publication");
assert.equal(await rawReady([staleIndex(),goodIndex()],rawIds,2,"doc-1","revision-new"),false,
 "a stale first index must block RAW publication");
assert.equal(await rawReady([goodIndex(),{getByIds:async()=>[]}],rawIds,2,"doc-1","revision-new"),false,
 "missing Vectorize IDs must block RAW publication");
assert.equal(await rawReady([goodIndex(),{getByIds:async()=>{throw Error("unavailable")}}],
 rawIds,2,"doc-1","revision-new"),false,"readback errors must fail closed");
assert.equal(await rawReady([goodIndex()],rawIds,2,"doc-1","revision-new"),false,
 "both physical index bindings are required");
for(const bad of [[],["raw","raw"],[" "],["x".repeat(510)],
 Array.from({length:MAX_IDS+1},(_,i)=>"raw-"+i)]){
 assert.equal(rawBounded(bad,2,"doc-1","revision-new"),false);
 assert.equal(await rawReady([counted(),counted()],bad,2,"doc-1","revision-new"),false);
}
assert.equal(rawBounded(["raw"],0,"doc-1","revision-new"),false);
assert.equal(rawBounded(["raw"],2,"doc-1",""),false);
assert.equal(readCalls,4,"invalid manifests must never trigger remote reads");

// Check the actual HTTP caller, not merely the helper, invokes both gates
// before the D1 publication CAS.
const {readFileSync}=await import("node:fs");
const route=readFileSync(new URL("../app/api/drive-ingest-batch/route.ts",import.meta.url),"utf8");
const rawBranch=route.split('if (body?.action === "publish_staged")')[1]?.split('const action = body?.action')[0];
assert.ok(rawBranch,"missing RAW-only publication branch");
assert.ok(rawBranch.indexOf("hasBoundedRawPublicationManifest(")>=0);
assert.ok(rawBranch.indexOf("hasReadyRawStagedVectors(")>rawBranch.indexOf("hasBoundedRawPublicationManifest("));
assert.ok(rawBranch.indexOf("publishExactStagedManifest(")>rawBranch.indexOf("hasReadyRawStagedVectors("));
assert.match(rawBranch,/STAGED_VECTOR_NOT_READY/);
console.log("PASS: RAW-only publication requires bounded exact readback from both Vectorize indices before D1 CAS");
