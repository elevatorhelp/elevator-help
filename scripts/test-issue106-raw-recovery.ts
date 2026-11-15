import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 claimGlobalArchiveLease,releaseGlobalArchiveLease,
 type CoordinatorDB,
} from "../app/lib/ingestion-global-coordinator.ts";
import {claimDocumentStagingEpoch} from "../app/lib/ingestion-document-staging-epoch.ts";
import {
 immutableVectorId,stageImmutableVectorPair,type ImmutableIndex,
} from "../app/lib/ingestion-immutable-publication.ts";
import {reconcileExistingQaV2RawChunks}
 from "../app/lib/qa-v2-raw-recovery.ts";

const temp=mkdtempSync(join(tmpdir(),"qa106-raw-reconcile-"));
const sqlite=new DatabaseSync(join(temp,"qa.sqlite"));
const db:CoordinatorDB={prepare:(sql:string)=>({
 bind:(...args:unknown[])=>({
   first:async()=> (sqlite.prepare(sql).get(...(args as any[]))
     as Record<string,unknown>|undefined) ?? null,
   bind:()=>{throw Error("REBIND_DENIED");},
 }),
 first:async()=>{throw Error("BIND_REQUIRED");},
})};
for(const path of [
 "../docs/ingestion-global-coordinator-schema.sql",
 "../docs/ingestion-immutable-publication-schema.sql",
 "../docs/ingestion-v2-document-epoch-schema.sql",
])sqlite.exec(readFileSync(new URL(path,import.meta.url),"utf8"));
type RecordEntry={id:string;metadata:Record<string,unknown>;values:number[]};
class FakeIndex implements ImmutableIndex{
 map=new Map<string,RecordEntry>();
 inserts=0;
 async insert(xs:RecordEntry[]){
   this.inserts+=xs.length;
   for(const x of xs)this.map.set(x.id,structuredClone(x));
 }
 async getByIds(ids:string[]){
   return ids.map(id=>this.map.get(id)).filter(Boolean)
      .map(x=>structuredClone(x));
 }
 record(entry:RecordEntry){this.map.set(entry.id,structuredClone(entry));}
}
const legacy=new FakeIndex(),multi=new FakeIndex();
const job="drive:QA106RawRecoveryFixtureRoot";
const doc="QA106-fictional-pdf";
const fp="a".repeat(64);
const meta=(i:number)=>({
 status:"active",sourceFileId:doc,sourceFingerprint:fp,
 fileName:"fixture.pdf",sourcePath:"qa/fixture.pdf",
 text:"QA106 synthetic source sentence",page:1,chunkIndex:i,
 contentType:"standard",
});
const values=(id:string,i:number)=>({
 logicalId:id,sourceFingerprint:fp,
 legacyValues:[1,2,3],multilingualValues:[4,5,6],
 metadata:meta(i),
});
const count=()=>Number(sqlite.prepare(
 "SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE layer='raw'"
).get()?.n??0);
try{
 const leaseA=await claimGlobalArchiveLease(
   db,job,"gh-42678073650-aaaaaaaaaaaaaaaa");
 assert.ok(leaseA);
 const epoch=await claimDocumentStagingEpoch(db,leaseA,doc,fp);
 assert.equal(epoch,1);
 const physical1=await stageImmutableVectorPair(
    db,leaseA,doc,"raw",values("raw-1",0),[legacy,multi],Date.now(),epoch!);
 assert.equal(count(),1);
 const before=legacy.inserts+multi.inserts;
 const partiallyReused=await reconcileExistingQaV2RawChunks(
   db,leaseA,doc,fp,epoch!,["raw-1","raw-2"],[legacy,multi]);
 assert.equal(partiallyReused.get("raw-1"),physical1);
 assert.equal(partiallyReused.has("raw-2"),false);
 assert.equal(count(),1);
 assert.equal(legacy.inserts+multi.inserts,before,
   "Recovery must never reinsert or pay for existing vectors");

 // Simulate previous run inserting BOTH indices before its D1 receipt.
 const orphanId=immutableVectorId(leaseA,doc,"raw","raw-2",fp,epoch!);
 legacy.record({id:orphanId,values:[1,2,3],metadata:{
   ...meta(1),stagedGeneration:epoch!,stagedLayer:"raw",
 }});
 multi.record({id:orphanId,values:[4,5,6],metadata:{
   ...meta(1),stagedGeneration:epoch!,stagedLayer:"raw",
 }});
 const recovered=await reconcileExistingQaV2RawChunks(
   db,leaseA,doc,fp,epoch!,["raw-1","raw-2"],[legacy,multi]);
 assert.equal(recovered.get("raw-2"),orphanId);
 assert.equal(count(),2,"Pair with missing D1 receipt is attested without model");
 assert.equal(legacy.inserts+multi.inserts,before);

 // Half-written remote stage MUST block a new paid embedding.
 const partialId=immutableVectorId(leaseA,doc,"raw","raw-3",fp,epoch!);
 legacy.record({id:partialId,values:[1,2,3],metadata:{
   ...meta(2),stagedGeneration:epoch!,stagedLayer:"raw",
 }});
 await assert.rejects(reconcileExistingQaV2RawChunks(
   db,leaseA,doc,fp,epoch!,["raw-3"],[legacy,multi]),
   /V2_RAW_RECOVERY_INCOMPLETE_PAIR/);
 await assert.rejects(reconcileExistingQaV2RawChunks(
   db,leaseA,doc,fp,epoch!,["raw-1","raw-1"],[legacy,multi]),
   /V2_RAW_RECOVERY_DUPLICATE_OR_INVALID_BATCH/);

 // A NEW lease recovers the same revision and physical IDs, zero model calls.
 assert.equal(await releaseGlobalArchiveLease(db,leaseA),true);
 const leaseB=await claimGlobalArchiveLease(
   db,job,"gh-42678073651-bbbbbbbbbbbbbbbb");
 assert.ok(leaseB&&leaseB.generation>leaseA.generation);
 const sameEpoch=await claimDocumentStagingEpoch(db,leaseB!,doc,fp);
 assert.equal(sameEpoch,epoch);
 const success=await reconcileExistingQaV2RawChunks(
   db,leaseB!,doc,fp,epoch!,["raw-1","raw-2"],[legacy,multi]);
 assert.deepEqual([...success.values()],[physical1,orphanId]);
 assert.equal(count(),2);
 assert.equal(legacy.inserts+multi.inserts,before);

 multi.map.delete(physical1);
 await assert.rejects(reconcileExistingQaV2RawChunks(
   db,leaseB!,doc,fp,epoch!,["raw-1"],[legacy,multi]),
   /V2_RAW_RECOVERY_INCOMPLETE_PAIR/);
 assert.equal(count(),2);
 console.log("PASS: Issue106 durable RAW receipt reuse, orphan-vector recovery, "+
  "successor lease, half-index fail-closed, zero repeated embeddings");
}finally{
 sqlite.close();
 rmSync(temp,{recursive:true,force:true});
}
