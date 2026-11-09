import assert from "node:assert/strict";
import { shardForDocumentId, splitIngestionState, assertShardState, validateShardParameters } from "./archive-sharding.mjs";

const ids = Array.from({length:241}, (_, n)=>"drive-file-"+n);
const counts=[0,0];
for(const id of ids) counts[shardForDocumentId(id)]++;
assert.equal(counts[0]+counts[1],ids.length);
assert.ok(counts.every(n=>n>0));
assert.equal(ids.filter(id=>shardForDocumentId(id)===0).length,counts[0]);
assert.equal(ids.filter(id=>shardForDocumentId(id)===1).length,counts[1]);
assert.equal(new Set(ids.map(id=>id+":"+shardForDocumentId(id))).size,ids.length);
assert.throws(()=>validateShardParameters(-1,2),/INVALID_ARCHIVE/);
assert.throws(()=>validateShardParameters(0,3),/INVALID_ARCHIVE/);
assert.throws(()=>shardForDocumentId(""),/INVALID_ARCHIVE/);

const files=Object.fromEntries(ids.map((id,i)=>[id,{
 fingerprint:"fp"+i,
 partialRawIds:i%3===0?["raw-"+i]:[],
 rawNextChunk:i%3===0?1:undefined,
 evidenceIds:i%5===0?["ev-"+i]:[],
 mapNextPage:i%7===0?2:undefined,
}]));
const failures=Object.fromEntries(ids.filter((_,i)=>i%19===0).map(id=>[id,{attempts:2,category:"INVALID_PDF"}]));
const legacy={version:3,scopes:{"drive-root":{files,fileFailures:failures,lastSelectedPhase:"raw",phaseCursors:{raw:"cursor"}}}};
const a=splitIngestionState(legacy,0,2);
const b=splitIngestionState(legacy,1,2);
assertShardState(a,0,2);assertShardState(b,1,2);
const aIds=new Set(Object.keys(a.scopes["drive-root"].files));
const bIds=new Set(Object.keys(b.scopes["drive-root"].files));
assert.equal(aIds.size+bIds.size,ids.length);
for(const id of aIds)assert.equal(bIds.has(id),false);
for(const id of ids) {
 const record=(aIds.has(id)?a:b).scopes["drive-root"].files[id];
 assert.deepEqual(record,files[id],"no checkpoint loss");
}
assert.equal(Object.keys(a.scopes["drive-root"].fileFailures).length+Object.keys(b.scopes["drive-root"].fileFailures).length,Object.keys(failures).length);
assert.deepEqual(legacy.scopes["drive-root"].files,files,"migration must not modify legacy state");
assert.throws(()=>assertShardState(a,1,2),/PARALLEL_SHARD_MARKER_MISMATCH/);
assert.throws(()=>splitIngestionState(a,0,2),/INVALID_LEGACY_STATE/);
a.scopes["drive-root"].files[ids.find(id=>bIds.has(id))]={};
assert.throws(()=>assertShardState(a,0,2),/CROSS_SHARD_STATE_RECORD/);
console.log("PASS: 241-document deterministic disjoint shards, checkpoint and failure-ledger preservation, fail-closed mismatch");
