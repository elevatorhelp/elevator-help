/** Regression: immutable Map intent survives late Cloudflare Vectorize visibility. */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {
  claimGlobalArchiveLease,releaseGlobalArchiveLease,
  type CoordinatorDB,
} from "../app/lib/ingestion-global-coordinator.ts";
import {claimDocumentStagingEpoch} from "../app/lib/ingestion-document-staging-epoch.ts";
import {
  immutableVectorId,stageImmutableExactEvidence,stageImmutableVectorPair,
  publishImmutableThreeLayerGeneration,type ImmutableIndex
} from "../app/lib/ingestion-immutable-publication.ts";
import {
  immutableMapWindowKey,registerPendingMapWindow,reconcilePendingMapWindow
} from "../app/lib/ingestion-v2-map-reconciliation.ts";

const tmp=mkdtempSync(join(tmpdir(),"issue104-map-recovery-"));
const sqlite=new DatabaseSync(join(tmp,"qa.sqlite"));
const db:CoordinatorDB={
  prepare:(sql:string)=>({
    bind:(...args:unknown[])=>({
      first:async()=>sqlite.prepare(sql).get(...(args as any[])) as Record<string,unknown>|null??null,
      bind:()=>{throw Error("DOUBLE_BIND_NOT_ALLOWED");}
    }),
    first:async()=>{throw Error("BIND_REQUIRED");}
  })
};
for(const path of [
  "../docs/ingestion-global-coordinator-schema.sql",
  "../docs/ingestion-immutable-publication-schema.sql",
  "../docs/ingestion-v2-document-epoch-schema.sql",
  "../docs/ingestion-v2-pending-map-windows-schema.sql",
])sqlite.exec(readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8"));
const job="drive:QaFixtureRootIssue104Test";
const doc="synthetic-pdf-qa-104";
const fingerprint="a".repeat(64);
const changedFingerprint="b".repeat(64);
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const version=4;
const pages=[{page:1,text:"QA-4711 fictional test code"},{page:2,text:"MOCK-DOOR-12 fictional test"}];
const mapIds=["map-"+"1".repeat(40),"map-"+"2".repeat(40)];
type RecordEntry={id:string;metadata:Record<string,unknown>;values:number[]};
class FakeIndex implements ImmutableIndex {
  map=new Map<string,RecordEntry>();
  inserts=0;
  async insert(vectors:RecordEntry[]){
    this.inserts+=vectors.length;
    for(const v of vectors)if(!this.map.has(v.id))this.map.set(v.id,structuredClone(v));
  }
  async getByIds(ids:string[]){
    return ids.map(id=>this.map.get(id)).filter(Boolean).map(x=>structuredClone(x));
  }
  record(entry:RecordEntry){this.map.set(entry.id,structuredClone(entry));}
}
const indexA=new FakeIndex(),indexB=new FakeIndex();
function physical(lease:{jobKey:string;owner:string;generation:number},
  epoch:number,logicalId:string,fp=fingerprint):RecordEntry{
  return {
    id:immutableVectorId(lease,doc,"map",logicalId,fp,epoch),
    values:[1,2,3],
    metadata:{
      sourceFileId:doc,sourceFingerprint:fp,
      stagedLayer:"map",stagedGeneration:epoch,
      contentType:"document-map",status:"active",
      fileName:"qa.pdf",sourcePath:"QA/qa.pdf",
      text:"A synthetic source from page 1",page:1,pageEnd:2,
      chunkIndex:-1,mapVersion:version,
    },
  };
}
function count(table:string,condition=""){
  return Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} ${condition}`).get()?.n);
}
try{
  const leaseA=await claimGlobalArchiveLease(db,job,ownerA);
  assert.ok(leaseA);
  const epoch=await claimDocumentStagingEpoch(db,leaseA,doc,fingerprint);
  assert.equal(epoch,1);
  const key=immutableMapWindowKey(doc,fingerprint,version,pages);
  assert.equal(key.length,64);
  assert.notEqual(key,immutableMapWindowKey(doc,fingerprint,version,
    [{page:1,text:"different source"},{page:2,text:pages[1].text}]));
  assert.notEqual(key,immutableMapWindowKey(doc,fingerprint,version+1,pages));
  assert.deepEqual(
    await reconcilePendingMapWindow(db,leaseA,doc,fingerprint,epoch!,key,
      version,[indexA,indexB]),{status:"none"});
  const intent=await registerPendingMapWindow(
    db,leaseA,doc,fingerprint,epoch!,key,version,mapIds);
  assert.equal(intent.length,2);
  assert.equal(count("ingestion_v2_pending_map_windows"),1);
  assert.equal(count("ingestion_v2_vector_receipts"),0,
    "no receipts before actual verified two-index readback");
  assert.deepEqual(
    await reconcilePendingMapWindow(db,leaseA,doc,fingerprint,epoch!,key,
      version,[indexA,indexB]),
    {status:"pending",mapCount:2,documentEpoch:epoch});
  // Real first attempt: model already called; inserts happen externally but
  // the readback is incomplete. A retry MUST NOT insert or re-embed.
  for(const id of mapIds)indexA.record(physical(leaseA,epoch!,id));
  assert.equal((await reconcilePendingMapWindow(
    db,leaseA,doc,fingerprint,epoch!,key,version,[indexA,indexB])).status,"pending");
  assert.equal(count("ingestion_v2_vector_receipts"),0);
  assert.equal(indexA.inserts+indexB.inserts,0);
  assert.equal(await releaseGlobalArchiveLease(db,leaseA),true);
  const leaseB=await claimGlobalArchiveLease(db,job,ownerB);
  assert.ok(leaseB && leaseB.generation>leaseA.generation);
  // Delayed Vectorize propagation becomes visible to a DIFFERENT owner.
  for(const id of mapIds)indexB.record(physical(leaseB!,epoch!,id));
  const recovered=await reconcilePendingMapWindow(
    db,leaseB!,doc,fingerprint,epoch!,key,version,[indexA,indexB]);
  assert.equal(recovered.status,"complete");
  if(recovered.status!=="complete")throw Error("TYPE_NARROWING");
  assert.deepEqual(recovered.stagedIds,intent.map(x=>x.stagedId));
  assert.equal(count("ingestion_v2_vector_receipts"),2);
  assert.equal(indexA.inserts+indexB.inserts,0,
    "recovery never reinserts already created Gemini vectors");
  const repeat=await reconcilePendingMapWindow(
    db,leaseB!,doc,fingerprint,epoch!,key,version,[indexA,indexB]);
  assert.equal(repeat.status,"complete","receipt reconciliation is idempotent");
  assert.equal(count("ingestion_v2_vector_receipts"),2);
  assert.deepEqual(await reconcilePendingMapWindow(
    db,leaseB!,doc,fingerprint,epoch!,immutableMapWindowKey(
      doc,fingerprint,version,[{page:1,text:"altered"},pages[1]]),
    version,[indexA,indexB]),{status:"none"},
    "different text cannot reuse paid intent");
  // Unpublished staged pairs cannot be visible without the full manifest.
  assert.equal(count("ingestion_v2_publications"),0);
  const rawRec={
    logicalId:"raw-1",sourceFingerprint:fingerprint,
    legacyValues:[1,2,3],multilingualValues:[1,2,3],
    metadata:{sourceFileId:doc,sourceFingerprint:fingerprint,
      status:"active",text:"synthetic",fileName:"qa.pdf",
      sourcePath:"QA/qa.pdf",page:1,chunkIndex:0,contentType:"standard"}
  };
  const rawId=await stageImmutableVectorPair(db,leaseB!,doc,
    "raw",rawRec,[indexA,indexB],Date.now(),epoch!);
  assert.ok(await stageImmutableExactEvidence(db,leaseB!,doc,{
    logicalId:"e-1",sourceFingerprint:fingerprint,
    text:"Original synthetic PDF page 1",fileName:"qa.pdf",
    sourcePath:"QA/qa.pdf",page:1,chunkIndex:0,
  },Date.now(),epoch!));
  assert.equal(await publishImmutableThreeLayerGeneration(db,leaseB!,doc,{
    rawIds:[rawId],mapIds:recovered.stagedIds,
    evidenceIds:["e-1"],sourceFingerprint:fingerprint,
  },Date.now(),epoch!),true,"full 3-layer D1 CAS after late Map recovery");
  assert.equal(count("ingestion_v2_publications"),1);
  const corrupt=physical(leaseB!,epoch!,mapIds[0]);
  corrupt.metadata.page=0;
  indexA.record(corrupt);
  await assert.rejects(()=>reconcilePendingMapWindow(
    db,leaseB!,doc,fingerprint,epoch!,key,version,[indexA,indexB]),
    /V2_MAP_PENDING_VECTOR_METADATA_MISMATCH/);
  indexA.record(physical(leaseB!,epoch!,mapIds[0]));
  await assert.rejects(()=>registerPendingMapWindow(
    db,leaseB!,doc,fingerprint,epoch!,key,version,[mapIds[0]]),
    /V2_MAP_PENDING_INTENT_DENIED/);
  assert.equal(count("ingestion_v2_pending_map_windows"),1,
    "conflicting rerun must not overwrite previously paid Map intent");
  const epoch2=await claimDocumentStagingEpoch(db,leaseB!,doc,changedFingerprint);
  assert.equal(epoch2,epoch!+1);
  assert.deepEqual(await reconcilePendingMapWindow(
    db,leaseB!,doc,changedFingerprint,epoch2!,immutableMapWindowKey(
      doc,changedFingerprint,version,pages),version,[indexA,indexB]),
    {status:"none"},"old source revision cannot leak into new generation");
  assert.equal(count("ingestion_v2_pending_map_windows"),1);
  await assert.rejects(()=>reconcilePendingMapWindow(
    db,leaseA,doc,fingerprint,epoch!,key,version,[indexA,indexB]),
    /IMMUTABLE_STAGE_LEASE_STALE|STAGED_VECTOR_RECEIPT_DENIED/,
    "old writer generation must fail even if vector bytes are present");
  console.log("PASS: Issue104 delayed two-index Map recovery, no duplicate Gemini, source/epoch fencing and exact D1 publication");
}finally{
  sqlite.close();
  rmSync(tmp,{recursive:true,force:true});
}
