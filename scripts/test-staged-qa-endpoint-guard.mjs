import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const safe="https://elevator-help-pr61-app-qa.baharmand.workers.dev";
for(const map of ["https://elevator.help/api/document-map-ingest","https://example.net/api/document-map-ingest"]){
 const r=spawnSync(process.execPath,["scripts/drive-ingest.mjs"],{
  env:{...process.env,STAGED_AUTO_LEASE:"true",TARGET_FILE_ID:"qa-fixture",
   INGEST_ENDPOINT:safe+"/api/drive-ingest-batch",
   DOCUMENT_MAP_ENDPOINT:map,
   GOOGLE_SERVICE_ACCOUNT_JSON:"",ELEVATOR_INGESTION_TOKEN:""},
  encoding:"utf8",timeout:15000
 });
 assert.notEqual(r.status,0,"unsafe map endpoint must abort");
 assert.match(r.stderr,/STAGED_AUTO_LEASE_REQUIRES_ISOLATED_SINGLE_DOCUMENT/);
}
console.log("PASS: isolated Drive pilot rejects mismatched Map endpoint before credentials/network");
