import assert from "node:assert/strict";
import {parseQaDriveRecoveryResponse} from "./qa-drive-recovery-response.mjs";
import {requirePr61IsolatedQaOrigin} from "./qa-pr61-isolated-origin.mjs";
import {buildQaFullAppMultipageFixture,hasQaFullAppMapPageCoverage} from "./qa-pr61-full-app-fixture.mjs";
const qaOrigin=requirePr61IsolatedQaOrigin(process.env.QA_APP_BASE_URL);
const token=process.env.QA_INGESTION_TOKEN;
if(!token)throw Error("QA_APP_CONFIGURATION_MISSING");
const run=(String(process.env.GITHUB_RUN_ID||Date.now())+"-"+String(process.env.GITHUB_RUN_ATTEMPT||"1")).replace(/[^0-9-]/g,"");
const doc="qa61-complete-"+run;
const revision="revision-"+doc;
const owner="qa-full-"+run;
const headers={"content-type":"application/json",Authorization:"Bearer "+token};
const {chunks,evidence,pages,rawIds,evidenceIds}=buildQaFullAppMultipageFixture(doc,revision);
async function post(path,data){
 const response=await fetch(new URL(path,qaOrigin),{method:"POST",headers,body:JSON.stringify(data),redirect:"manual",signal:AbortSignal.timeout(120000)});
 try {
  return await parseQaDriveRecoveryResponse(response);
 } catch(error) {
  throw new Error("INVALID_QA_JSON_HTTP_"+response.status,{cause:error});
 }
}
const ingest=(value)=>post("/api/drive-ingest-batch",value);
const result=await ingest({action:"lease_claim",documentId:doc,owner,durationMs:180000});
assert.equal(result.status,200,JSON.stringify(result));
const lease=result.lease;
assert.equal(lease.jobKey,doc);
const contested=await ingest({action:"lease_claim",documentId:doc,owner:"qa-contender-"+run,durationMs:180000});
assert.equal(contested.status,409,"second owner must be rejected");
console.log("PASS: isolated actual app issues and fences automatic document lease");
const renew=()=>ingest({action:"lease_renew",lease,durationMs:180000});
let res=await renew();
assert.equal(res.status,200,"lease renewal");
res=await ingest({action:"index_evidence",lease,chunks:evidence});
assert.equal(res.status,200,"generation staged evidence: "+JSON.stringify(res));
assert.equal(res.staged,true);
res=await ingest({action:"upsert",lease,chunks});
assert.equal(res.status,200,"raw upsert: "+JSON.stringify(res));
assert.equal(res.staged,true);
const map=await post("/api/document-map-ingest",{
 lease,document:{sourceFileId:doc,fileName:"qa.txt",sourcePath:"qa/synthetic",
 sourceFingerprint:revision,mapVersion:4},
 pages
});
assert.equal(map.status,200,"staged map: "+JSON.stringify(map));
assert.ok(Array.isArray(map.ids)&&map.ids.length>0,"map should generate actual staged nodes");
assert.ok(hasQaFullAppMapPageCoverage(map.nodes,pages),
 "generated Document Map must cover both physical QA pages, not just accept page-2 input");
const prefix="g"+lease.generation+":";
assert.ok(map.ids.every(id=>id.startsWith(prefix)));
const mapIds=map.ids.map(id=>id.slice(prefix.length));
console.log("PASS: real document map generated and stored with generation-scoped IDs");
res=await ingest({action:"publish_staged",lease,documentId:doc,sourceFingerprint:revision,manifestIds:rawIds});
assert.equal(res.status,409,"raw-only publish must be disabled in complete mode");
res=await ingest({action:"publish_full",lease,documentId:doc,sourceFingerprint:revision,
 rawIds,evidenceIds,mapIds:[...mapIds,"bad-node"]});
assert.equal(res.status,409,"invalid map manifest must not publish");
const payload={action:"publish_full",lease,documentId:doc,sourceFingerprint:revision,
 rawIds,evidenceIds,mapIds};
let published=false;
for(let attempt=0;attempt<36;attempt++){
 if(attempt%6===0){
  const r=await renew();
  assert.equal(r.status,200,"renewal during Vectorize readiness wait");
 }
 res=await ingest(payload);
 if(res.status===200&&res.published===true){published=true;break;}
 assert.equal(res.status,409,"unexpected publication error "+JSON.stringify(res));
 if(!["STAGED_VECTOR_NOT_READY","FULL_PUBLICATION_FAILED"].includes(res.error||""))
  throw Error("UNEXPECTED_PUBLICATION_REJECTION_"+JSON.stringify(res));
 await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(published,true,"complete generation did not become publishable");
console.log("PASS: actual app atomically published RAW, exact Evidence and Map only after vector readiness");
const stale=await ingest({action:"lease_renew",lease:{...lease,owner:"qa-stale"},durationMs:180000});
assert.equal(stale.status,409);
console.log("PASS: PR61 FULL isolated worker E2E complete");
