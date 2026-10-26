import assert from "node:assert/strict";
import {hasExactStagedVectorReadback as ready} from "../app/lib/ingestion-vector-readback.ts";
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
console.log("PASS: dual staged Vectorize readbacks require exact document/revision metadata");
