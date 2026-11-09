import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {splitLatestSerialState,mergeCanaryCheckpoints} from "./dual-indexer-checkpoint.mjs";
import {shardForDocumentId,assertShardState} from "./archive-sharding.mjs";

const ids=Array.from({length:241},(_,i)=>"source-id-"+i);
const files=Object.fromEntries(ids.map((id,i)=>[id,{
  fingerprint:"revision-"+i,evidenceIds:i%3===0?["evidence-"+i]:[],
  partialRawIds:i%2===0?["raw-"+i]:[],
  rawNextChunk:i%2===0?1:undefined,mapNextPage:1,
}]));
const original={version:3,scopes:{root:{
 files,phaseCursors:{evidence:"cursor-e"},lastSelectedPhase:"raw",
 fileFailures:{[ids[7]]:{category:"INVALID_PDF",attempts:2}},
}}};
const shards=splitLatestSerialState(original);
for(let i=0;i<2;i++)assertShardState(shards[i],i,2);
const overlap=Object.keys(shards[0].scopes.root.files).filter(id=>id in shards[1].scopes.root.files);
assert.equal(overlap.length,0);
assert.equal(Object.keys(shards[0].scopes.root.files).length+Object.keys(shards[1].scopes.root.files).length,241);
const changed=ids[33],target=shardForDocumentId(changed);
shards[target].scopes.root.files[changed].indexedAt="2026-11-09T17:00:00Z";
shards[target].scopes.root.phaseCursors={map:"after-file-33"};
shards[target].scopes.root.lastSelectedPhase="map";
const merged=mergeCanaryCheckpoints(original,...shards);
assert.equal(Object.keys(merged.scopes.root.files).length,241);
assert.equal(merged.scopes.root.files[changed].indexedAt,"2026-11-09T17:00:00Z");
assert.equal(merged.scopes.root.fileFailures[ids[7]].attempts,2);
assert.equal(merged.scopes.root.parallelCursors[target].map,"after-file-33");
assert.equal(merged.scopes.root.phaseCursors.evidence,"cursor-e");
assert.equal(merged.parallelShard,undefined);
assert.equal(original.scopes.root.files[changed].indexedAt,undefined,"must not mutate serial base");
const resumed=splitLatestSerialState(merged);
assert.equal(resumed[target].scopes.root.phaseCursors.map,"after-file-33");
assert.equal(resumed[target].scopes.root.lastSelectedPhase,"map");
for(let i=0;i<2;i++)assertShardState(resumed[i],i,2);
assert.throws(()=>mergeCanaryCheckpoints(original,shards[1],shards[0]),/PARALLEL_SHARD_MARKER_MISMATCH/);
assert.throws(()=>splitLatestSerialState({...original,parallelShard:{index:0,count:2,version:1}}),/DUAL_CANARY_REQUIRES_VERIFIED_SERIAL_CHECKPOINT/);
const script=fileURLToPath(new URL("./run-dual-archive-indexers.mjs",import.meta.url));
const baseEnv={...process.env,
  GOOGLE_SERVICE_ACCOUNT_JSON:"",ELEVATOR_INGESTION_TOKEN:"",
  GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_RUN_ID:"123456789",DUAL_CANARY_RUN_ID:"123456789",
  DUAL_CANARY_ENABLED:"true",DUAL_CANARY_CONFIRMATION:"APPROVE_2_DOCUMENTS_SHARED_60_CALLS",
};
const run=(extra)=>spawnSync(process.execPath,[script],{
  env:{...baseEnv,...extra},encoding:"utf8",timeout:10000,
});
let blocked=run({DUAL_CANARY_CONFIRMATION:""});
assert.equal(blocked.status,1);
assert.match(blocked.stderr,/DUAL_CANARY_NOT_EXPLICITLY_AUTHORIZED/);
blocked=run({});
assert.equal(blocked.status,1);
assert.match(blocked.stderr,/DUAL_CANARY_INGESTION_CREDENTIALS_UNAVAILABLE/);
blocked=run({DRIVE_FOLDER_ID:"unapproved-source"});
assert.equal(blocked.status,1);
assert.match(blocked.stderr,/DUAL_CANARY_UNAPPROVED_DRIVE_SCOPE/);
console.log("PASS: 241-file two-process canary partition/merge, restart cursors, fail-closed approval and rollback");
