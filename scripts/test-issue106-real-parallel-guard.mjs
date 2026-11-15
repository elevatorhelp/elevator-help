import assert from "node:assert/strict";
import {
  QA106_ROOT,QA106_PDFS,QA106_PORTS,QA106_CONFIRM,qa106JobKey,
  assertQa106ParallelContext
} from "./qa-issue106-parallel-guard.mjs";
import {assertManualQaV2Environment} from "./ingestion-v2-qa-guard.mjs";
const env=(slot)=>{
 const port=QA106_PORTS[slot];
 const origin="http://127.0.0.1:"+port;
 return {
   GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
   GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"43740001234",
   INGESTION_D1_EXPLICIT_RUN_ID:"43740001234",
   INGESTION_V2_QA_MODE:"true",
   INGESTION_D1_COORDINATOR_MODE:"strict",
   DRIVE_FOLDER_ID:QA106_ROOT,
   INGESTION_V2_QA_DRIVE_ROOT:QA106_ROOT,
   INGESTION_V2_QA_ORIGIN:origin,
   INGEST_ENDPOINT:origin+"/api/drive-ingest-batch",
   DOCUMENT_MAP_ENDPOINT:origin+"/api/document-map-ingest",
   INGESTION_COORDINATOR_ENDPOINT:origin+"/api/ingestion-coordinator",
   INGESTION_IMMUTABLE_ENDPOINT:origin+"/api/immutable-archive-publish",
   INGESTION_V2_QA_PARALLEL_MODE:"true",
   INGESTION_V2_QA_PARALLEL_SLOT:slot,
   INGESTION_V2_QA_PARALLEL_FILE_ID:QA106_PDFS[slot],
   INGESTION_V2_QA_PARALLEL_CONFIRMATION:QA106_CONFIRM,
   QA_V2_JOB_KEY:qa106JobKey(slot),
   MAX_FILES:"1",MAX_GEMINI_CALLS:"4",
 };
};
assert.notEqual(QA106_PDFS.A,QA106_PDFS.B);
assert.notEqual(qa106JobKey("A"),qa106JobKey("B"));
for(const slot of ["A","B"]){
 const vars=env(slot);
 assert.equal(assertManualQaV2Environment(vars),vars.INGESTION_V2_QA_ORIGIN);
 const approved=assertQa106ParallelContext(vars);
 assert.equal(approved.documentId,QA106_PDFS[slot]);
 assert.equal(approved.jobKey,qa106JobKey(slot));
 for(const [key,value] of [
   ["GITHUB_EVENT_NAME","push"],
   ["GITHUB_REF","refs/heads/main-bad"],
   ["DRIVE_FOLDER_ID","1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5"],
   ["INGESTION_V2_QA_DRIVE_ROOT","1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5"],
   ["INGESTION_V2_QA_PARALLEL_FILE_ID",QA106_PDFS[slot==="A"?"B":"A"]],
   ["QA_V2_JOB_KEY",qa106JobKey(slot==="A"?"B":"A")],
   ["INGESTION_V2_QA_PARALLEL_CONFIRMATION","NO_APPROVAL"],
   ["MAX_FILES","2"],
   ["MAX_GEMINI_CALLS","12"],
   ["INGESTION_V2_QA_ORIGIN","https://elevator.help"],
   ["TARGET_FILE_ID",QA106_PDFS[slot]],
   ["ARCHIVE_SHARD_INDEX","0"],
   ["INGESTION_D1_BOOTSTRAP_APPROVED","true"]
 ]){
  assert.throws(()=>assertManualQaV2Environment({...vars,[key]:value}),
    /QA106_|V2_QA_/,
    slot+" must reject "+key);
 }
}
assert.equal(assertQa106ParallelContext({}),null);
assert.throws(()=>assertQa106ParallelContext({
  INGESTION_V2_QA_PARALLEL_SLOT:"A"
}),/QA106_UNAPPROVED/);
console.log("PASS: Issue106 exact two-PDF, independent job key, narrow per-worker budget, manual-only QA guards");
