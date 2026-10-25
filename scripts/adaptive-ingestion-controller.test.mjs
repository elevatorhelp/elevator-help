import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import {planIngestion} from "./adaptive-ingestion-controller.mjs";
const queues={evidence:5,raw:5,map:5};
const metrics={observedAt:1000,d1Remaining:1000,geminiRemaining:100,runtimeRemainingMs:100000,d1PerFile:10,geminiPerFile:2,runtimePerFileMs:1000};
test("baseline stays at two when disabled",()=>assert.equal(planIngestion({queues}).maxFiles,2));
test("rotates phase with durable cursor",()=>assert.equal(planIngestion({queues,cursor:1}).phase,"raw"));
test("skips empty phases",()=>assert.equal(planIngestion({queues:{map:3}}).phase,"map"));
test("returns no work for empty queues",()=>assert.equal(planIngestion().maxFiles,0));
test("adaptive scales only with fresh bounded telemetry",()=>assert.equal(planIngestion({queues,telemetry:metrics,policy:{adaptiveEnabled:true,maxFiles:10},now:1000}).maxFiles,5));
test("stale telemetry falls back to baseline",()=>assert.equal(planIngestion({queues,telemetry:metrics,policy:{adaptiveEnabled:true,maxFiles:10},now:1000000}).maxFiles,2));
test("budget exhaustion stops work",()=>assert.equal(planIngestion({queues,telemetry:{...metrics,geminiRemaining:0},policy:{adaptiveEnabled:true,maxFiles:10},now:1000}).maxFiles,0));
test("never exceeds hard max",()=>assert.equal(planIngestion({queues:{evidence:100},telemetry:metrics,policy:{adaptiveEnabled:true,maxFiles:3},now:1000}).maxFiles,3));
test("explicit zero cap disables processing",()=>assert.equal(planIngestion({queues,policy:{maxFiles:0}}).maxFiles,0));
test("explicit cap below baseline is respected",()=>assert.equal(planIngestion({queues,policy:{maxFiles:1}}).maxFiles,1));
test("cursor wraps around",()=>assert.equal(planIngestion({queues,cursor:4}).phase,"raw"));
test("missing telemetry respects explicit cap",()=>assert.equal(planIngestion({queues,policy:{adaptiveEnabled:true,maxFiles:1}}).maxFiles,1));

test("untrusted baseline cannot raise the two-file fallback",()=>{
 for (const cursor of [0,1,2,4]) {
  for (const baselineFiles of [3,20,1000]) {
   for (const options of [
    {policy:{adaptiveEnabled:false}},
    {telemetry:null,policy:{adaptiveEnabled:true}},
    {telemetry:{...metrics,observedAt:0},now:1000000,policy:{adaptiveEnabled:true}},
    {telemetry:{...metrics,d1Remaining:NaN},now:1000,policy:{adaptiveEnabled:true}},
   ]) {
    const input={queues:{evidence:100,raw:100,map:100},cursor,...options,
     policy:{...options.policy,baselineFiles,maxFiles:20}};
    const first=planIngestion(input);
    assert.equal(first.maxFiles,2,`${first.reason}: baseline=${baselineFiles}, cursor=${cursor}`);
    // Replayed planning after interruption must preserve the same bound and decision.
    assert.deepEqual(planIngestion(JSON.parse(JSON.stringify(input))),first);
   }
  }
 }
});

test("fresh telemetry still permits explicitly bounded adaptive capacity",()=>{
 assert.equal(planIngestion({queues:{map:100},telemetry:metrics,now:1000,
  policy:{baselineFiles:20,maxFiles:10,adaptiveEnabled:true}}).maxFiles,10);
});

test("real ingester integration remains opt-in and bounded",async()=>{
 const source=await readFile(new URL("./drive-ingest.mjs",import.meta.url),"utf8");
 assert.match(source,/INGESTION_CONTROLLER_ENABLED === "true"/);
 assert.match(source,/planIngestion\(/);
 assert.match(source,/maxFiles: MAX_FILES, adaptiveEnabled: false/);
 assert.match(source,/scope.nextPhaseCursor = capacity.nextCursor/);
});

test("phase cursor and partial chunk checkpoint survive restart",async()=>{
 const {mkdtemp,rm}=await import("node:fs/promises");
 const {tmpdir}=await import("node:os");
 const {join}=await import("node:path");
 const {readIngestionState,writeIngestionState,canResumeRaw}=await import("./drive-ingest.mjs");
 const dir=await mkdtemp(join(tmpdir(),"archive-restart-"));
 const file=join(dir,"checkpoint.json");
 try {
  const state={version:3,scopes:{archive:{nextPhaseCursor:2,phaseCursors:{raw:"cursor"},files:{doc:{partialRawEmbeddingVersion:3,partialRawFingerprint:"v1",partialRawIds:["a","b"],rawNextChunk:2}}}}};
  await writeIngestionState(state,file);
  const restarted=await readIngestionState(file,false);
  assert.equal(restarted.scopes.archive.nextPhaseCursor,2);
  assert.equal(planIngestion({queues:{map:1},cursor:restarted.scopes.archive.nextPhaseCursor}).phase,"map");
  assert.equal(canResumeRaw(restarted.scopes.archive.files.doc,"v1"),true);
  assert.equal(canResumeRaw(restarted.scopes.archive.files.doc,"v2"),false);
  await assert.rejects(readIngestionState(join(dir,"missing.json"),false),/INGESTION_STATE_MISSING/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
