import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import worker,{inspectSlot} from "./qa-issue106-vector-status-worker.mjs";
import {safeQa106IndexSummary} from "./qa-issue106-vector-status-report.mjs";
const root="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const ids={
 A:"1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v",
 B:"1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn",
};
const fp="a".repeat(64),epoch=2;
const mapId="map-"+"b".repeat(40);
const stagedId="v2m-2-"+"c".repeat(40);
const window=[{logicalId:mapId,stagedId}];
const meta=id=>({
 sourceFileId:id,sourceFingerprint:fp,stagedGeneration:epoch,
 stagedLayer:"map",contentType:"document-map",status:"active",
 text:"Synthetic QA text",fileName:"fixture.pdf",sourcePath:"qa/fixture.pdf",
 page:1,pageEnd:2
});
const fakeEnv=(slot,{legacy=true,v2=true,invalid=false}={})=>{
 const id=ids[slot],job="drive:"+root+"_qa_"+slot;
 let writes=0;
 const db={prepare:(sql)=>{
   assert.match(sql,/^SELECT /);
   return {bind:(...args)=>{
     assert.equal(args[0],id);assert.equal(args[1],job);
     return {
       first:async()=>{
         assert.match(sql,/ingestion_v2_document_epochs/);
         return {staging_epoch:epoch,source_fingerprint:fp};
       },
       all:async()=>{
         if(sql.includes("ingestion_v2_pending_map_windows"))
           return {results:[{ids_json:JSON.stringify(window)}]};
         if(sql.includes("ingestion_v2_vector_receipts"))
           return {results:[]};
         throw Error("UNRECOGNIZED_SQL");
       }
     };
   }};
 }};
 const index=(present,wrong)=>({
   getByIds:async query=>{
     assert.deepEqual(query,[stagedId]);
     return present?[{id:stagedId,metadata:{...meta(id),
       ...(wrong?{stagedLayer:"raw"}:{})}}]:[];
   }
 });
 return {CORTEX_DB:db,VECTORIZE:index(legacy,false),
   VECTORIZE_V2:index(v2,invalid),DIAG_TOKEN:"x".repeat(64),
   writes};
};
const b=await inspectSlot(fakeEnv("B",{legacy:true,v2:false}),"B");
assert.deepEqual(safeQa106IndexSummary({ok:true,...b},"B"),{
 slot:"B",pending:1,receipts:0,
 legacyMissing:0,v2Missing:1,
 legacyInvalid:0,v2Invalid:0,bothValid:0,bothMissing:0
});
const a=await inspectSlot(fakeEnv("A"),"A");
assert.equal(a.bothValid,1);
const none=await inspectSlot(fakeEnv("B",{legacy:false,v2:false}),"B");
assert.equal(none.bothMissing,1);
const corrupt=await inspectSlot(fakeEnv("B",{legacy:true,v2:true,invalid:true}),"B");
assert.equal(corrupt.v2Invalid,1);
assert.throws(()=>safeQa106IndexSummary({ok:true,...a,legacyMissing:3},"A"),
 /UNVERIFIED_RESPONSE/);
await assert.rejects(inspectSlot(fakeEnv("B"),"C"),/UNKNOWN_SLOT/);
const forbidden=await worker.fetch(
 new Request("http://localhost/inspect",{method:"POST",
 headers:{"Content-Type":"application/json"},
 body:JSON.stringify({slot:"A"})}),fakeEnv("A"));
assert.equal(forbidden.status,403);
const allowed=await worker.fetch(new Request("http://localhost/inspect",{
 method:"POST",headers:{"Content-Type":"application/json",
 Authorization:"Bearer "+"x".repeat(64)},body:JSON.stringify({slot:"A"})}),
 fakeEnv("A"));
assert.equal(allowed.status,200);
const data=await allowed.json();
assert.equal(data.bothValid,1);
assert.ok(!JSON.stringify(data).includes(ids.A));
const config=readFileSync(new URL("../wrangler.qa106-vector-readonly.json",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/qa-issue106-vector-index-readonly.yml",import.meta.url),"utf8");
const shell=readFileSync(new URL("./qa-issue106-vector-status-run.sh",import.meta.url),"utf8");
assert.deepEqual(JSON.parse(config).vectorize.map(x=>x.index_name),
 ["elevator-help-staging-test","elevator-help-staging-test-v2"]);
assert.ok(!Object.hasOwn(JSON.parse(config),"ai"));
assert.doesNotMatch(config,/production|GEMINI|OPENAI_API_KEY/i);
assert.doesNotMatch(workflow,/secrets\.(?:GEMINI|OPENAI|GOOGLE_GENAI)_/);
assert.match(workflow,/branches: \[main\]/);
assert.doesNotMatch(shell,/\b(upsert|insert|delete)\b/i);
assert.match(shell,/unset GEMINI_API_KEY GEMINI_BENCHMARK_API_KEY/);
console.log("PASS: Issue106 dual Vectorize metadata/presence probe read-only; no model, source data or IDs leaked");
