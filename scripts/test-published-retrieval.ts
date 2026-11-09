import assert from "node:assert/strict";
import {publishedArchiveEnv} from "../app/lib/ingestion-published-reader.ts";
import {searchArchiveEvidenceIndex} from "../app/lib/archive-evidence-index.ts";

const gen="v2r-1-"+"a".repeat(40);
const forged="v2r-1-"+"b".repeat(40);
const activeMeta={
 sourceFileId:"doc-published",sourceFingerprint:"fp-2026",
 stagedGeneration:1,stagedLayer:"raw",status:"active",
 text:"Published source page one",fileName:"fictional.pdf",sourcePath:"qa/fictional.pdf",
 page:1,chunkIndex:0,contentType:"standard",
};
const original=[
 {id:gen,metadata:activeMeta},
 {id:forged,metadata:activeMeta},
 {id:"legacy-old",metadata:{sourceFileId:"doc-published",text:"superseded"}},
 {id:"legacy-live",metadata:{sourceFileId:"doc-unpublished",text:"valid legacy"}},
];
const row=(id:string,doc:string)=>({
 id,text:"fictional source",source_file_id:doc,file_name:"fictional.pdf",
 source_path:"qa/fictional.pdf",page:1,chunk_index:0,content_type:"standard",
 source_fingerprint:"fp-2026",identifier_labels:"FOO",matched_identifiers:1,
});
let queries=0,lookups=0,reads=0;
const rawDb={
 prepare:(sql:string)=>({
  bind:(...args:unknown[])=>({
   first:async()=>{
     reads++;
     if(sql.includes("ingestion_v2_publications"))return args[0]==="doc-published"
       ?{active_generation:1,source_fingerprint:"fp-2026"}:null;
     if(sql.includes("ingestion_v2_vector_receipts"))return args[0]===gen
       ?{present:1}:null;
     throw Error("UNKNOWN_D1_SQL");
   },
   all:async()=>({results:[
     row("old","doc-published"),row("current","doc-unpublished"),
   ]}),
  }),
 }),
};
const index={
 query:async(..._args:unknown[])=>{queries++;return {count:original.length,matches:original}},
 getByIds:async(..._ids:unknown[])=>{lookups++;return original},
};
const rawEnv={INGESTION_PUBLISHED_READS_ENABLED:"false",
  VECTORIZE:index,VECTORIZE_V2:index,CORTEX_DB:rawDb};
assert.equal(publishedArchiveEnv(rawEnv),rawEnv,
  "feature off must preserve existing production bindings exactly");
const strict=publishedArchiveEnv({...rawEnv,INGESTION_PUBLISHED_READS_ENABLED:"true"});
const result=await strict.VECTORIZE.query([1,2,3],{topK:10,returnMetadata:"all"});
assert.deepEqual(result.matches.map(x=>x.id),[gen,"legacy-live"],
 "published generation only; forged physical staged vector and superseded legacy hidden");
const results2=await strict.VECTORIZE_V2.getByIds(["any"]);
assert.deepEqual(results2.map(x=>x.id),[gen,"legacy-live"],
 "direct getByIds must share the same source-visibility proof");
assert.equal(queries,1);assert.equal(lookups,1);
const identifiers=[{key:"foo",label:"FOO",structured:true}];
const rows=await searchArchiveEvidenceIndex(strict.CORTEX_DB,identifiers as any,[],60);
assert.deepEqual(rows.map(x=>x.source_file_id),["doc-unpublished"],
 "exact old Evidence must disappear after immutable generation publish");
const oldRows=await searchArchiveEvidenceIndex(rawDb,identifiers as any,[],60);
assert.deepEqual(oldRows.map(x=>x.source_file_id),["doc-published","doc-unpublished"],
 "feature off retains old exact Evidence behavior");
const noDb=publishedArchiveEnv({...rawEnv,INGESTION_PUBLISHED_READS_ENABLED:"true",CORTEX_DB:undefined});
assert.deepEqual((await noDb.VECTORIZE.query([1])).matches,[],
 "strict mode without D1 does not expose unverified vectors");
assert.equal(noDb.CORTEX_DB,undefined);
const downDb={
 prepare:(sql:string)=>({
  bind:()=>({first:async()=>{throw Error("D1_NOT_AVAILABLE");},
    all:async()=>({results:[row("old","doc-published")]})}),
 }),
};
const down=publishedArchiveEnv({...rawEnv,INGESTION_PUBLISHED_READS_ENABLED:"true",CORTEX_DB:downDb});
assert.deepEqual((await down.VECTORIZE.query([1])).matches,[],
 "D1 outage fails closed for both staged and legacy vector matches");
assert.deepEqual(await searchArchiveEvidenceIndex(down.CORTEX_DB,identifiers as any,[],60),[],
 "D1 outage fails closed for exact legacy citation index");
console.log("PASS: dual Vectorize indexes + direct getByIds + exact D1 citations hide unpublished/forged/superseded records; disabled mode unchanged");
