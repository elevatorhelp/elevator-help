import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {claimGlobalArchiveLease,type ArchiveLease,type CoordinatorDB} from "../app/lib/ingestion-global-coordinator.ts";
import {
 immutableVectorId,parseImmutableVectorId,stageImmutableVectorPair,
 stageImmutableExactEvidence,publishImmutableThreeLayerGeneration,
 filterVisibleImmutableVectors,readPublishedImmutableEvidence,
 type ImmutableIndex,type PublicationLayer,
} from "../app/lib/ingestion-immutable-publication.ts";
const temp=mkdtempSync(join(tmpdir(),"immutable-publication-"));
const dbPath=join(temp,"qa.sqlite");
const a=new DatabaseSync(dbPath);
const b=new DatabaseSync(dbPath);
const fromSqlite=(sqlite:DatabaseSync):CoordinatorDB=>({
 prepare:sql=>({
   bind:(...params:unknown[])=>({
     bind:()=>{throw Error("REBIND_FORBIDDEN");},
     first:async()=>sqlite.prepare(sql).get(...(params as any[])) as Record<string,unknown>|null ?? null,
   }),
   first:async()=>{throw Error("BIND_REQUIRED");},
 }),
});
const dbA=fromSqlite(a),dbB=fromSqlite(b);
const evidenceReader={prepare:(sql:string)=>({
 bind:(...args:unknown[])=>({
   all:async()=>({results:a.prepare(sql).all(...(args as any[])) as Record<string,unknown>[]}),
 }),
})};
const job="drive:1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const doc="fictional-pdf-2026";
const fp="source-revision-1";
const now=Date.now();

class FakeIndex implements ImmutableIndex {
  map=new Map<string,{id:string;metadata:Record<string,unknown>;values:number[]}>();
  mutateAfterInsert:(()=>Promise<void>)|null=null;
  async insert(xs:Array<{id:string;values:number[];metadata:Record<string,unknown>}>){
    for(const v of xs){if(!this.map.has(v.id))this.map.set(v.id,structuredClone(v));}
    if(this.mutateAfterInsert)await this.mutateAfterInsert();
    return {mutationId:"fake"};
  }
  async getByIds(ids:string[]){
    return ids.map(id=>this.map.get(id)).filter(Boolean).map(v=>structuredClone(v));
  }
}
const idxA=new FakeIndex(),idxB=new FakeIndex();
const vec=(logicalId:string,layer:PublicationLayer,fingerprint=fp)=>({
 logicalId,sourceFingerprint:fingerprint,
 legacyValues:[1,2,3],multilingualValues:[4,5,6],
 metadata:{
   status:"active",text:"A fictional technical sample from page one.",
   fileName:"fixture.pdf",sourcePath:"test/fixture.pdf",page:1,
   ...(layer==="raw"?{chunkIndex:0,contentType:"standard"}:
      {pageEnd:1,contentType:"document-map",chunkIndex:-1}),
 },
});
const evidence=(logicalId:string,fingerprint=fp)=>({
 logicalId,sourceFingerprint:fingerprint,text:"Full exact source evidence page one.",
 fileName:"fixture.pdf",sourcePath:"test/fixture.pdf",page:1,chunkIndex:0,
});
try{
  a.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-global-coordinator-schema.sql",import.meta.url)),"utf8"));
  a.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-immutable-publication-schema.sql",import.meta.url)),"utf8"));
  const leaseA=await claimGlobalArchiveLease(dbA,job,ownerA,180_000,now);
  assert.ok(leaseA);
  const maxId=immutableVectorId({...leaseA,generation:Number.MAX_SAFE_INTEGER},doc,"raw","x".repeat(300),fp);
  assert.ok(Buffer.byteLength(maxId,"utf8")<=64,"vector physical ID must respect Cloudflare 64 byte limit");
  assert.equal(parseImmutableVectorId(maxId)?.generation,Number.MAX_SAFE_INTEGER);
  assert.equal(parseImmutableVectorId("v2r-01-"+"0".repeat(40)),null,"no noncanonical generations");
  assert.equal(parseImmutableVectorId("g1:legacy-long-id"),null);

  const raw1=await stageImmutableVectorPair(dbA,leaseA,doc,"raw",vec("raw-1","raw"),[idxA,idxB]);
  assert.equal(raw1,immutableVectorId(leaseA,doc,"raw","raw-1",fp));
  assert.equal(parseImmutableVectorId(raw1)?.layer,"raw");
  assert.ok(await stageImmutableExactEvidence(dbA,leaseA,doc,evidence("evidence-1")));
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1"],mapIds:[immutableVectorId(leaseA,doc,"map","map-1",fp)],sourceFingerprint:fp,
  }),false,"missing Map prevents publication");
  assert.equal(a.prepare("SELECT COUNT(*) AS n FROM ingestion_v2_publications").get()?.n,0);
  assert.equal((await readPublishedImmutableEvidence(evidenceReader,doc)).length,0,
    "unpublished exact source pages must remain invisible");
  const map1=await stageImmutableVectorPair(dbA,leaseA,doc,"map",vec("map-1","map"),[idxA,idxB]);
  assert.equal(map1,immutableVectorId(leaseA,doc,"map","map-1",fp));
  const incomplete=await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1"],mapIds:[map1],sourceFingerprint:"wrong-revision",
  });
  assert.equal(incomplete,false,"source fingerprint mismatch denies publication");
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1,"unexpected"],evidenceIds:["evidence-1"],mapIds:[map1],sourceFingerprint:fp,
  }),false,"exact missing raw chunk denies");
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1","missing-e"],mapIds:[map1],sourceFingerprint:fp,
  }),false,"exact missing evidence denies");

  const visibleBefore=await filterVisibleImmutableVectors(dbB,[
    {id:raw1,metadata:(await idxA.getByIds([raw1]) as any[])[0].metadata},
    {id:map1,metadata:(await idxA.getByIds([map1]) as any[])[0].metadata},
  ]);
  assert.equal(visibleBefore.length,0,"staged vectors invisible before D1 CAS");
  const success=await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1"],mapIds:[map1],sourceFingerprint:fp,
  });
  assert.equal(success,true,"exact 3-layer receipt manifest publishes in one D1 CAS");
  assert.equal(a.prepare("SELECT active_generation FROM ingestion_v2_publications").get()?.active_generation,1);
  assert.equal((await readPublishedImmutableEvidence(evidenceReader,doc)).length,1,
    "only complete published generation's source page is visible");
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1"],mapIds:[map1],sourceFingerprint:fp,
  }),false,"a second CAS may not publish same generation again");
  const raw1meta=(await idxA.getByIds([raw1]) as any[])[0].metadata;
  const map1meta=(await idxA.getByIds([map1]) as any[])[0].metadata;
  assert.equal((await filterVisibleImmutableVectors(dbA,[
    {id:raw1,metadata:raw1meta},{id:map1,metadata:map1meta},
    {id:"legacy-raw",metadata:{sourceFileId:doc,text:"old"}},
    {id:raw1,metadata:{...raw1meta,sourceFingerprint:"wrong"}},
  ],true)).length,2,"only matching published physical generation/revision is visible");
  assert.equal((await filterVisibleImmutableVectors(undefined,[{id:raw1,metadata:raw1meta}],true)).length,0,
    "unavailable D1 fail-closed");
  assert.equal(await stageImmutableExactEvidence(dbA,leaseA,doc,{...evidence("evidence-1"),text:"tampered"}),false,
    "same-generation Evidence cannot be rewritten");
  // A new owner takes over. Old generation cannot publish, but may still
  // complete an external Vectorize insert (TOCTOU). Such vectors remain hidden.
  a.prepare("UPDATE ingestion_global_leases SET lease_until_ms=? WHERE job_key=?").run(now-1,job);
  const leaseB=await claimGlobalArchiveLease(dbB,job,ownerB,180_000,now+1);
  assert.ok(leaseB);assert.equal(leaseB.generation,2);
  assert.equal(await stageImmutableExactEvidence(dbA,leaseA,doc,evidence("late-evidence")),false);
  const raw2=await stageImmutableVectorPair(dbB,leaseB,doc,"raw",vec("raw-2","raw","source-revision-2"),[idxA,idxB]);
  assert.ok(await stageImmutableExactEvidence(dbB,leaseB,doc,evidence("evidence-2","source-revision-2")));
  assert.equal(await publishImmutableThreeLayerGeneration(dbB,leaseB,doc,{
    rawIds:[raw2],evidenceIds:["evidence-2"],mapIds:[immutableVectorId(leaseB,doc,"map","map-2","source-revision-2")],sourceFingerprint:"source-revision-2",
  }),false,"new generation incomplete still invisible; previous remains active");
  assert.equal((await filterVisibleImmutableVectors(dbA,[{id:raw1,metadata:raw1meta}],true)).length,1,
    "last complete generation remains visible until new CAS");

  // Simulate a real stale network request that started before lease takeover,
  // then finishes after generation 2 publication. First index insert may
  // succeed physically; receipt MUST fail and old generation cannot publish.
  let release!:()=>void;
  let inserted!:()=>void;
  const insertedSignal=new Promise<void>(resolve=>{inserted=resolve;});
  const delay=new Promise<void>(resolve=>{release=resolve;});
  const delayedA=new FakeIndex(),delayedB=new FakeIndex();
  delayedA.mutateAfterInsert=async()=>{inserted();await delay;};
  const delayedLease=await claimGlobalArchiveLease(dbB,job,ownerB,180_000,now+2);
  assert.equal(delayedLease,null,"old claim cannot renew owner via claim");
  // Stage generation 2 map and finalize before stale in-flight completion.
  const map2=await stageImmutableVectorPair(dbB,leaseB,doc,"map",vec("map-2","map","source-revision-2"),[idxA,idxB]);
  assert.ok(map2);
  assert.equal(await publishImmutableThreeLayerGeneration(dbB,leaseB,doc,{
    rawIds:[raw2],evidenceIds:["evidence-2"],mapIds:[map2],sourceFingerprint:"source-revision-2",
  }),true);
  const publishedPages=await readPublishedImmutableEvidence(evidenceReader,doc);
  assert.deepEqual(publishedPages.map(x=>x.logicalId),["evidence-2"],
    "stale evidence page must not survive new published generation");
  // Physical stale gen1 vector inserted with a new id after gen2 is active
  // cannot pass D1 publication filter; it is never visible.
  const staleId=immutableVectorId(leaseA,doc,"raw","late-raw",fp);
  await delayedB.insert([{id:staleId,values:[3],metadata:{...raw1meta,stagedGeneration:1}}]);
  const physicalStale={id:staleId,metadata:(await delayedB.getByIds([staleId]) as any[])[0].metadata};
  assert.equal((await filterVisibleImmutableVectors(dbA,[physicalStale],true)).length,0);
  assert.equal((await filterVisibleImmutableVectors(dbA,[{id:raw1,metadata:raw1meta}],true)).length,0,
    "old complete generation hidden after new complete generation CAS");
  const raw2meta=(await idxA.getByIds([raw2]) as any[])[0].metadata;
  assert.equal((await filterVisibleImmutableVectors(dbB,[{id:raw2,metadata:raw2meta}],true)).length,1);
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,leaseA,doc,{
    rawIds:[raw1],evidenceIds:["evidence-1"],mapIds:[map1],sourceFingerprint:fp,
  }),false,"stale owner cannot republish after generation 2");

  // Simulate post-commit stale delayed readback in an isolated third doc:
  const docLate="fictional-late-network-pdf";
  const current=await claimGlobalArchiveLease(dbA,job,ownerA,180_000,now+200_000);
  assert.ok(current);assert.equal(current.generation,3);
  const task=stageImmutableVectorPair(dbA,current,docLate,"raw",
    vec("late","raw",fp),[delayedA,delayedB]);
  await insertedSignal;
  a.prepare("UPDATE ingestion_global_leases SET lease_until_ms=? WHERE job_key=?").run(now-1,job);
  const next=await claimGlobalArchiveLease(dbB,job,ownerB,180_000,now+200_001);
  assert.ok(next);assert.equal(next.generation,4);
  release();
  await assert.rejects(task,/STAGED_VECTOR_RECEIPT_DENIED/);
  assert.equal(a.prepare("SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE document_id=?").get(docLate)?.n,0,
    "late remote insert after takeover must not create receipt");
  assert.equal((await filterVisibleImmutableVectors(dbA,[
    {id:immutableVectorId(current,docLate,"raw","late",fp),
      metadata:(await delayedA.getByIds([immutableVectorId(current,docLate,"raw","late",fp)]) as any[])[0].metadata}
  ],true)).length,0,"unpublished stale late-network vector remains invisible");
  console.log("PASS: 64B immutable IDs, dual-index physical readback, exact Evidence/RAW/Map D1 CAS, stale generation, late network write invisible");
}finally{
 a.close();b.close();rmSync(temp,{recursive:true,force:true});
}
