import assert from "node:assert/strict";
import {hasExactQaVectorReadback} from "./qa-pr61-vector-readback.mjs";
import {assertBothQaConfigs} from "./qa-pr61-assert-isolated-config.mjs";
import {parseQaHttpResponse} from "./qa-pr61-verified-http-response.mjs";
import {execFileSync} from "node:child_process";
import {PR61_LOOPBACK_QA_ORIGIN,requirePr61LoopbackQaOrigin} from "./qa-pr61-isolated-origin.mjs";
// Direct CLI invocation must also fail closed before remote D1 or Vectorize calls.
assertBothQaConfigs();
const base=new URL("/api/drive-ingest-batch",requirePr61LoopbackQaOrigin(process.env.QA_APP_BASE_URL||PR61_LOOPBACK_QA_ORIGIN));
const secret=process.env.QA_INGESTION_TOKEN;
if(!secret)throw Error("QA_INGESTION_TOKEN_REQUIRED");
const run=((process.env.GITHUB_RUN_ID||Date.now().toString())+"-"+(process.env.GITHUB_RUN_ATTEMPT||"1")).replace(/[^0-9-]/g,"");
const doc="qa61-app-"+run,fp="qa-file-revision-"+run,owner="qa-owner-"+run;
const sql=(q)=>{
 const args=["wrangler","d1","execute","elevator-help-lease-test-01","--remote","--config","wrangler.qa-app.json","--command",q];
 return execFileSync("npx",args,{encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]});
};
const quote=v=>"'"+v.replaceAll("'","''")+"'";
const now=Date.now();
sql(`INSERT OR IGNORE INTO ingestion_document_publications(document_id,job_key,active_generation,updated_at_ms) VALUES(${quote(doc)},${quote(doc)},0,${now});
INSERT INTO ingestion_worker_leases(job_key,owner,generation,lease_until_ms,updated_at_ms) VALUES(${quote(doc)},${quote(owner)},1,${now+420000},${now});`);
const lease={jobKey:doc,owner,generation:1};
async function post(payload){
 const response=await fetch(base,{method:"POST",headers:{Authorization:"Bearer "+secret,"content-type":"application/json"},body:JSON.stringify(payload),redirect:"manual",signal:AbortSignal.timeout(120000)});
 return parseQaHttpResponse(response);
}
let r=await post({action:"status",lease});
assert.equal(r.status,200,"actual Next.js status route failed: "+JSON.stringify(r));
assert.equal(r.legacyConfigured,true);assert.equal(r.multilingualConfigured,true);
assert.equal(r.archiveIndexConfigured,true);
console.log("PASS: real OpenNext API /api/drive-ingest-batch active on isolated bindings");
r=await post({action:"publish_staged",lease,documentId:doc,sourceFingerprint:fp,manifestIds:[doc+":1"]});
assert.equal(r.status,409,"unwritten document must not publish");
console.log("PASS: actual API rejects unpublished manifest");
const evidence=await post({action:"index_evidence",lease,chunks:[{
 id:doc+":evidence",text:"QA exact evidence must remain unpublished",
 sourceFileId:doc,fileName:"qa.txt",sourcePath:"qa/test",page:1,chunkIndex:0
}]});
assert.equal(evidence.status,409,"staged evidence write must be blocked");
assert.equal(evidence.error,"STAGED_EVIDENCE_PUBLICATION_NOT_IMPLEMENTED");
const deletion=await post({action:"delete",lease,ids:[doc+":evidence"]});
assert.equal(deletion.status,409,"staged deletion must be blocked");
console.log("PASS: unfinished staged evidence and deletion fail closed");
if (process.env.QA_NEGATIVE_ONLY === "true") {
  const wrong=await post({action:"publish_staged",
    lease:{...lease,owner:"qa-invalid-owner"},documentId:doc,
    sourceFingerprint:fp,manifestIds:[doc+":1"]});
  assert.equal(wrong.status,409,"stale lease must fail");
  console.log("PASS: real OpenNext route rejects invalid ownership and unpublished manifest");
  console.log("PARTIAL: positive real Gemini upsert requires GEMINI_API_KEY on the isolated Cloudflare QA Worker");
  process.exit(0);
}
r=await post({action:"upsert",lease,chunks:[{id:doc+":1",text:"EN 81-20 QA test technical sentence one.",sourceFileId:doc,fileName:"qa.txt",sourcePath:"qa/test",page:1,chunkIndex:0,sourceFingerprint:fp},{id:doc+":2",text:"EN 81-50 QA test technical sentence two.",sourceFileId:doc,fileName:"qa.txt",sourcePath:"qa/test",page:1,chunkIndex:1,sourceFingerprint:fp}]});
assert.equal(r.status,200,"real application upsert failed: "+JSON.stringify(r));
assert.equal(r.staged,true);
const actualStagedIds=r.ids;
assert.ok(Array.isArray(actualStagedIds)&&actualStagedIds.length===2,"server did not return both staged IDs");
console.log("PASS: real Next.js API staged 2 raw document chunks");
r=await post({action:"publish_staged",lease,documentId:doc,sourceFingerprint:fp,manifestIds:[doc+":1",doc+":wrong"]});
assert.equal(r.status,409,"wrong manifest erroneously published");
r=await post({action:"publish_staged",lease,documentId:doc,sourceFingerprint:fp,manifestIds:[doc+":1",doc+":2"]});
assert.equal(r.status,200,"real application publish failed: "+JSON.stringify(r));
assert.equal(r.published,true);
console.log("PASS: actual Next.js API exact-manifest atomic publication");
// Prove real read-after-publication: a successful API write alone is not retrieval evidence.
const expectedIds=actualStagedIds;
const qaIndexes=["elevator-help-staging-test","elevator-help-staging-test-v2"];
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
 throw Error("QA_CLOUDFLARE_CREDENTIALS_REQUIRED");
const pending=new Set(qaIndexes);
// Both physical indices must return all expected IDs. Aliasing two bindings to
// the same index would conceal an incomplete dual-index recovery.
for(let attempt=0;attempt<24&&pending.size;attempt++){
 for(const index of [...pending]){
  const vectorUrl="https://api.cloudflare.com/client/v4/accounts/"+
   encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)+
   "/vectorize/v2/indexes/"+encodeURIComponent(index)+"/get_by_ids";
  const response=await fetch(vectorUrl,{method:"POST",headers:{
   Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,
   "Content-Type":"application/json"
  },body:JSON.stringify({ids:expectedIds}),redirect:"manual",signal:AbortSignal.timeout(30000)});
  const payload=await response.json();
  if(!response.ok||payload.success===false)
   throw Error("QA_VECTORIZE_READ_FAILED_HTTP_"+response.status+"_"+index);
  const records=Array.isArray(payload.result)?payload.result:
   Array.isArray(payload.result?.vectors)?payload.result.vectors:[];
  if(attempt===0||attempt===5||attempt===15||attempt===23)
   console.log("QA isolated Vectorize read",JSON.stringify({index,attempt,found:records.length,expected:expectedIds.length}));
  // Both physical indices must carry the exact staged source revision.
  if(hasExactQaVectorReadback(records,expectedIds,doc,fp))pending.delete(index);
 }
 if(pending.size)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(pending.size,0,"Staged vectors missing from independent QA indices: "+[...pending].join(","));
const d1Read=execFileSync("npx",["wrangler","d1","execute",
 "elevator-help-lease-test-01","--remote","--config","wrangler.qa-app.json",
 "--command",`SELECT active_generation FROM ingestion_document_publications WHERE document_id=${quote(doc)}`,
 "--json"],{encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]});
const queryRows=JSON.parse(d1Read).flatMap(item=>item.results||[]);
assert.equal(Number(queryRows[0]?.active_generation),1,"D1 active generation mismatch");
console.log("PASS: published Gemini-backed chunks retrieved from isolated Vectorize with active D1 generation");
console.log("PASS: actual OpenNext API integration: real Gemini embeddings + two Vectorize writes + D1");
