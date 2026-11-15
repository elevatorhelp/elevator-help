import assert from "node:assert/strict";
import {
 QA106_A_PDF_ID,QA106_B_PDF_ID,QA106_B_JOB,
 preflightExactMissingQa106BMap,assertExactQa106BRegeneration
} from "../app/lib/qa106-b-exact-map-repair.ts";
import {immutableVectorId} from "../app/lib/ingestion-immutable-publication.ts";

const fp="a".repeat(64),windowKey="b".repeat(64),epoch=2,mapVersion=4;
const lease={jobKey:QA106_B_JOB,owner:"gh-43768455056-"+"c".repeat(24),generation:18};
const logical=["map-"+"d".repeat(40),"map-"+"e".repeat(40)];
const entries=logical.map(id=>({logicalId:id,stagedId:
 immutableVectorId(lease,QA106_B_PDF_ID,"map",id,fp,epoch)}));
const metadata={sourceFileId:QA106_B_PDF_ID,sourceFingerprint:fp,
 stagedGeneration:epoch,stagedLayer:"map",contentType:"document-map",
 status:"active",text:"synthetic source-grounded test text",
 fileName:"fixture.pdf",sourcePath:"qa/fixture.pdf",page:1,pageEnd:2};
function mock(overrides={}){
 const state={aPublished:true,bPublished:false,evidence:2,raw:2,
   receipt:{logical_id:logical[0],staged_id:entries[0].stagedId,
     source_fingerprint:fp},
   allIndexes:[true,true],badMetadata:false,halfMissing:false,...overrides};
 let writes=0,reads=0,dbCalls=0;
 const db={prepare:sql=>{
   assert.match(sql,/^SELECT /);
   dbCalls++;
   return {bind:(...params)=>({
     first:async()=>{
       if(sql.includes("ingestion_v2_document_epochs"))
         return {staging_epoch:epoch,source_fingerprint:fp};
       if(sql.includes("ingestion_v2_publications")){
         if(params[0]===QA106_A_PDF_ID)
           return state.aPublished?{source_fingerprint:fp,raw_count:2,
             evidence_count:2,map_count:2}:null;
         return state.bPublished?{published:1}:null;
       }
       if(sql.includes("ingestion_v2_staged_evidence"))
         return {n:state.evidence};
       if(sql.includes("ingestion_v2_vector_receipts"))
         return {n:state.raw};
       throw Error("unexpected SELECT first");
     },
     all:async()=>{
       if(sql.includes("ingestion_v2_pending_map_windows"))
         return {results:[{ids_json:JSON.stringify(entries)}]};
       if(sql.includes("ingestion_v2_vector_receipts"))
         return {results:state.receipt?[state.receipt]:[]};
       throw Error("unexpected SELECT all");
     }
   })};
 }};
 const vector=(i)=>({
   getByIds:async ids=>{
     reads++;
     const id=ids[0],pos=entries.findIndex(e=>e.stagedId===id);
     if(pos===0||pos===1&&state.allIndexes[i]){
       if(pos===1&&state.halfMissing&&i===1)return [];
       return [{id,metadata:{...metadata,
         ...(state.badMetadata&&i===1?{stagedLayer:"raw"}:{})}}];
     }
     return [];
   }
 });
 return {db,indices:[vector(0),vector(1)],counts:()=>({writes,reads,dbCalls})};
}
const original=mock({allIndexes:[false,false]});
const plan=await preflightExactMissingQa106BMap(
 original.db,lease,QA106_B_PDF_ID,fp,epoch,windowKey,mapVersion,original.indices);
assert.equal(plan.missingLogicalId,logical[1]);
assert.equal(plan.missingPhysicalId,entries[1].stagedId);
assert.deepEqual(plan.entries,entries);
assert.equal(original.counts().writes,0);
assert.equal(assertExactQa106BRegeneration(plan,[logical[0],logical[1]]),1);
assert.equal(assertExactQa106BRegeneration(plan,[logical[1],logical[0]]),0);
assert.throws(()=>assertExactQa106BRegeneration(plan,[logical[0],
  "map-"+"f".repeat(40)]),/REGENERATION_MISMATCH/);
assert.throws(()=>assertExactQa106BRegeneration(plan,[logical[0]]),
 /REGENERATION_MISMATCH/);
assert.throws(()=>assertExactQa106BRegeneration(plan,[logical[0],logical[0]]),
 /REGENERATION_MISMATCH/);
const tryBad=async(state,pattern)=>assert.rejects(
 preflightExactMissingQa106BMap(state.db,lease,QA106_B_PDF_ID,fp,
   epoch,windowKey,mapVersion,state.indices),pattern);
await tryBad(mock({aPublished:false}),/A_NOT_PUBLISHED/);
await tryBad(mock({bPublished:true}),/B_ALREADY_PUBLISHED/);
await tryBad(mock({evidence:1}),/B_RAW_EVIDENCE_INCOMPLETE/);
await tryBad(mock({raw:1}),/B_RAW_EVIDENCE_INCOMPLETE/);
await tryBad(mock({receipt:null}),/RECEIPT_COUNT_CHANGED/);
await tryBad(mock({halfMissing:true,allIndexes:[true,true]}),
 /MISSING_PAIR_CHANGED/);
await tryBad(mock({badMetadata:true,allIndexes:[false,false]}),
 /EXISTING_PAIR_INVALID/);
await tryBad(mock({allIndexes:[true,true]}),/MISSING_PAIR_CHANGED/);
await assert.rejects(preflightExactMissingQa106BMap(
 original.db,lease,QA106_A_PDF_ID,fp,epoch,windowKey,mapVersion,
 original.indices),/SCOPE_DENIED/);
console.log("PASS: QA106 exactly one missing B Map pair, original ID regeneration, no A writes or changed IDs");
