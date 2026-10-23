import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {extractReferenceIdentifiers} from "../app/lib/reference-identifiers.ts";
const fileId="1VRn4-2Pm_Pl_W5gU0OYmRl_Oh2xljMYf";
const sql="SELECT e.document_id,e.generation,e.chunk_id,e.identifiers_json,e.page "+
 "FROM ingestion_staged_evidence e JOIN ingestion_document_publications p "+
 "ON p.document_id=e.document_id AND p.active_generation=e.generation "+
 "WHERE e.document_id='"+fileId+"' ORDER BY e.chunk_id LIMIT 1";
const output=execFileSync("npx",["wrangler","d1","execute","elevator-help-lease-test-01",
 "--remote","--config","wrangler.qa-app-deployed.json","--command",sql,"--json"],{
 encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]
});
const rows=JSON.parse(output).flatMap(x=>x.results||[]);
assert.equal(rows.length,1,"pilot document active evidence missing from isolated D1");
const record=rows[0];
const ids=JSON.parse(record.identifiers_json);
const candidate=ids.find(x=>typeof x.label==="string"&&
  extractReferenceIdentifiers(x.label).some(y=>y.key===x.key));
assert.ok(candidate,"pilot document has no queryable deterministic identifier");
const response=await fetch(process.env.QA_APP_BASE_URL+"/api/qa-evidence-lookup",{
 method:"POST",headers:{"Authorization":"Bearer "+process.env.QA_INGESTION_TOKEN,
 "Content-Type":"application/json"},body:JSON.stringify({query:candidate.label})
});
assert.equal(response.status,200,"published exact evidence lookup HTTP status");
const body=await response.json();
assert.equal(body.ok,true);
const match=body.results?.find(x=>x.sourceFileId===fileId&&x.chunkId===record.chunk_id);
assert.ok(match,"published exact document not found from actual application lookup");
assert.equal(match.page,record.page,"incorrect citation page");
assert.ok(typeof match.text==="string"&&match.text.length>=20,"missing source quotation");
assert.ok(match.fileName&&match.chunkId,"incomplete source citation");
console.log("PASS: customer-facing exact retrieval engine located the REAL Drive PDF, returned published raw evidence and source citation");
