import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assertManualQaV2Environment,attachDocumentEpoch,
  verifyV2StageBatch,verifyV2EvidenceReceipt,buildQaImmutableManifest,
  assertQaImmutablePublish,updateQaDeletionCandidate,
} from "./ingestion-v2-qa-guard.mjs";

function env(overrides={}){
  const origin="http://127.0.0.1:8787";
  return {
    GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
    GITHUB_RUN_ID:"42700012345",
    INGESTION_D1_EXPLICIT_RUN_ID:"42700012345",
    INGESTION_V2_QA_MODE:"true",
    INGESTION_D1_COORDINATOR_MODE:"strict",
    INGESTION_V2_QA_ORIGIN:origin,
    INGEST_ENDPOINT:origin+"/api/drive-ingest-batch",
    DOCUMENT_MAP_ENDPOINT:origin+"/api/document-map-ingest",
    INGESTION_COORDINATOR_ENDPOINT:origin+"/api/ingestion-coordinator",
    INGESTION_IMMUTABLE_ENDPOINT:origin+"/api/immutable-archive-publish",
    MAX_GEMINI_CALLS:"12",MAX_FILES:"1",
    DRIVE_FOLDER_ID:"QaSyntheticPdfRoot_20261109",
    INGESTION_V2_QA_DRIVE_ROOT:"QaSyntheticPdfRoot_20261109",
    ...overrides,
  };
}
function fails(fn,code){assert.throws(fn,new RegExp(code));}
assert.equal(assertManualQaV2Environment(env()),"http://127.0.0.1:8787");
const remote="https://elevator-help-qa.project.workers.dev";
assert.equal(assertManualQaV2Environment(env({
  INGESTION_V2_QA_ORIGIN:remote,
  INGEST_ENDPOINT:remote+"/api/drive-ingest-batch",
  DOCUMENT_MAP_ENDPOINT:remote+"/api/document-map-ingest",
  INGESTION_COORDINATOR_ENDPOINT:remote+"/api/ingestion-coordinator",
  INGESTION_IMMUTABLE_ENDPOINT:remote+"/api/immutable-archive-publish",
})),remote);
for(const [change,value] of Object.entries({
  GITHUB_ACTIONS:"false",GITHUB_EVENT_NAME:"schedule",
  INGESTION_D1_EXPLICIT_RUN_ID:"other",
  INGESTION_D1_COORDINATOR_MODE:"off",
  INGESTION_V2_QA_MODE:"false",
  ARCHIVE_SHARD_INDEX:"0",
  TARGET_FILE_ID:"some-file-id",
  FORCE_REINGEST:"true",
  INGESTION_D1_BOOTSTRAP_APPROVED:"true"
}))fails(()=>assertManualQaV2Environment(env({[change]:value})),"V2_QA_UNAPPROVED_EXECUTION");
for(const value of ["https://elevator.help","https://elevator.help:443",
  "https://qa.elevator.help","http://qa.example.com","https://example.com",
  "https://elevator-help-production.workers.dev","http://localhost:80"])
  fails(()=>assertManualQaV2Environment(env({INGESTION_V2_QA_ORIGIN:value})),"V2_QA_INVALID_ORIGIN");
fails(()=>assertManualQaV2Environment(env({INGEST_ENDPOINT:"https://elevator.help/api/drive-ingest-batch"})),"V2_QA_ENDPOINT_MISMATCH");
fails(()=>assertManualQaV2Environment(env({MAX_GEMINI_CALLS:"60"})),"V2_QA_UNBOUNDED_GEMINI");
fails(()=>assertManualQaV2Environment(env({MAX_FILES:"3"})),"V2_QA_UNBOUNDED_DOCUMENTS");
fails(()=>assertManualQaV2Environment(env({DRIVE_FOLDER_ID:"1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5"})),"V2_QA_SEPARATE_DRIVE_FIXTURE_REQUIRED");
fails(()=>assertManualQaV2Environment(env({INGESTION_V2_QA_DRIVE_ROOT:"some-other-test-root"})),"V2_QA_SEPARATE_DRIVE_FIXTURE_REQUIRED");

const rawId="v2r-3-"+"a".repeat(40);
const mapId="v2m-3-"+"b".repeat(40);
const record={extractionQuality:{status:"text_layer_complete"}};
assert.deepEqual(verifyV2EvidenceReceipt(
  {ok:true,staged:true,published:false,documentEpoch:3},"drv-evidence-1",record
),"drv-evidence-1");
assert.deepEqual(verifyV2StageBatch(
  {ok:true,published:false,documentEpoch:3,stagedIds:[rawId]},
  [{id:"drv-source-1"}],"raw",record
),[rawId]);
assert.deepEqual(verifyV2StageBatch(
  {ok:true,published:false,documentEpoch:3,stagedIds:[mapId]},
  [{id:"map-logical"}],"map",record
),[mapId]);
assert.equal(record.documentEpoch,3);
record.evidenceIds=["drv-evidence-1"];
record.ids=[rawId];
record.mapIds=[mapId];
record.evidenceFingerprint=record.rawFingerprint=record.mapFingerprint="source-v1";
const mf=buildQaImmutableManifest(record,"source-v1");
assert.deepEqual(mf,{
  sourceFingerprint:"source-v1",
  evidenceIds:["drv-evidence-1"],rawIds:[rawId],mapIds:[mapId],
});
assert.equal(buildQaImmutableManifest(record,"source-v2"),null);
assert.equal(buildQaImmutableManifest({...record,mapIds:[]},"source-v1"),null);
assert.equal(buildQaImmutableManifest({...record,ids:[rawId,rawId]},"source-v1"),null);
assert.equal(buildQaImmutableManifest({...record,extractionQuality:{status:"review_required"}},"source-v1"),null);
assert.equal(buildQaImmutableManifest({...record,evidenceFingerprint:"partial"},"source-v1"),null);
assert.equal(buildQaImmutableManifest({...record,documentEpoch:undefined},"source-v1"),null);
assert.equal(buildQaImmutableManifest({...record,mapIds:["old-unversioned-id"]},"source-v1"),null);
assertQaImmutablePublish({ok:true,published:true,generation:3},3);
fails(()=>assertQaImmutablePublish({ok:true,published:false,generation:3},3),"V2_QA_PUBLICATION_NOT_VERIFIED");
fails(()=>assertQaImmutablePublish({ok:true,published:true,generation:2},3),"V2_QA_PUBLICATION_NOT_VERIFIED");
fails(()=>attachDocumentEpoch(record,4),"V2_QA_DOCUMENT_EPOCH_CHANGED");
fails(()=>verifyV2StageBatch({
  ok:true,published:false,documentEpoch:3,stagedIds:["unversioned"]
},[{}],"raw",record),"V2_QA_INVALID_STAGE_RECEIPT");
fails(()=>verifyV2StageBatch({
  ok:true,published:false,documentEpoch:3,stagedIds:[rawId,mapId]
},[{}],"raw",record),"V2_QA_INVALID_STAGE_RECEIPT");
fails(()=>verifyV2StageBatch({
  ok:true,published:false,documentEpoch:4,stagedIds:[rawId]
},[{}],"raw",record),"V2_QA_DOCUMENT_EPOCH_CHANGED");

assert.equal(updateQaDeletionCandidate({},true).tombstonePending,false);
const missingOnce=updateQaDeletionCandidate({},true);
assert.equal(updateQaDeletionCandidate(missingOnce,true).tombstonePending,true);
assert.equal(updateQaDeletionCandidate(missingOnce,false).tombstonePending,false);

const runner=readFileSync(new URL("./drive-ingest.mjs",import.meta.url),"utf8");
const raw=readFileSync(new URL("../app/api/drive-ingest-batch/route.ts",import.meta.url),"utf8");
const map=readFileSync(new URL("../app/api/document-map-ingest/route.ts",import.meta.url),"utf8");
for(const [code,text] of [
  [runner,"if(V2_QA)assertManualQaV2Environment(process.env)"],
  [runner,"scope.v2Files"],
  [runner,"buildQaImmutableManifest(next,currentFingerprint)"],
  [runner,'action:"stage_evidence"'],
  [runner,'action:"publish"'],
  [runner,'action:V2_QA?"stage_upsert_v2":"upsert"'],
  [runner,'action:"stage_map_v2"'],
  [raw,"stageImmutableVectorPair("],
  [map,"stageImmutableVectorPair("],
]){
  assert.ok(code.includes(text),"Missing V2 integration contract");
}
console.log("PASS: QA mode fails closed; source revision epochs, staged IDs, atomic publication manifest and tombstone contracts");
