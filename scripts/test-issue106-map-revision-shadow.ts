import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  claimGlobalArchiveLease,releaseGlobalArchiveLease,
  type ArchiveLease,type CoordinatorDB,
} from "../app/lib/ingestion-global-coordinator.ts";
import {
  claimDocumentStagingEpoch,
} from "../app/lib/ingestion-document-staging-epoch.ts";
import {immutableVectorId,type ImmutableIndex}
 from "../app/lib/ingestion-immutable-publication.ts";
import {QA106_A_JOB,QA106_A_PDF_ID,QA106_B_JOB,QA106_B_PDF_ID}
 from "../app/lib/qa106-b-exact-map-repair.ts";
import {
 beginShadowMapRevision,persistGeneratedMapPayload,persistMapEmbeddings,
 reconcileShadowMapRevision,publishShadowMapRevision,readDurableShadowRevision,
 type RevisionScope,type RevisionNode,
} from "./qa-issue106-map-revision-shadow.ts";
import {filterShadowVisibleMapVectors}
 from "./qa-issue106-map-revision-shadow-read.ts";

const fp="a".repeat(64),key="b".repeat(64);
const temp=mkdtempSync(join(tmpdir(),"qa106-map-revision-offline-"));
const files=[
 "../docs/ingestion-global-coordinator-schema.sql",
 "../docs/ingestion-immutable-publication-schema.sql",
 "../docs/ingestion-v2-document-epoch-schema.sql",
 "../docs/ingestion-v2-pending-map-windows-schema.sql",
 "../docs/qa106-map-revision-shadow-schema.sql",
];
type RecordEntry={id:string;metadata:Record<string,unknown>;values:number[]};
class FakeIndex implements ImmutableIndex{
 map=new Map<string,RecordEntry>();
 inserts=0;
 async insert(xs:RecordEntry[]){
   this.inserts+=xs.length;
   for(const v of xs){
     if(this.map.has(v.id))throw Error("QA106_TEST_UNEXPECTED_REINSERT");
     this.map.set(v.id,structuredClone(v));
   }
 }
 async getByIds(ids:string[]){
   return ids.map(id=>this.map.get(id)).filter((v):v is RecordEntry=>!!v)
      .map(x=>structuredClone(x));
 }
 record(x:RecordEntry){this.map.set(x.id,structuredClone(x));}
}
function fixture(prefix:string){
 const sqlite=new DatabaseSync(join(temp,prefix+".sqlite"));
 sqlite.exec("PRAGMA foreign_keys=ON;");
 for(const file of files)
   sqlite.exec(readFileSync(new URL(file,import.meta.url),"utf8"));
 const db:CoordinatorDB={prepare:(sql:string)=>({
   bind:(...args:unknown[])=>({
     first:async()=> ((sqlite.prepare(sql).get(...(args as any[])) as Record<string,unknown>|undefined) ?? null),
     bind:()=>{throw Error("RE-BIND_NOT_ALLOWED")},
   }),
   first:async()=>{throw Error("BIND_REQUIRED")},
 })};
 const count=(sql:string,args:unknown[]=[])=>Number(
   (sqlite.prepare(sql).get(...(args as any[])) as {n:number})?.n??0);
 const read=(sql:string,args:unknown[]=[])=>sqlite.prepare(sql)
   .get(...(args as any[])) as Record<string,unknown>|undefined;
 return {sqlite,db,count,read,close:()=>sqlite.close()};
}
const nodes:RevisionNode[]=[1,2].map(page=>({
 text:`New QA grounded section ${page} from source, not original lost Map`,
 metadata:{
  sourceFileId:QA106_B_PDF_ID,sourceFingerprint:fp,
  fileName:"synthetic-b.pdf",sourcePath:"qa/synthetic-b.pdf",
  page,pageEnd:page,contentType:"document-map",status:"active",
  mapNodeType:"procedure",sectionTitle:`QA-B-${page}`,
 }
}));
const embeds=(entries:Array<{logicalId:string}>)=>entries.map((x,i)=>({
 logicalId:x.logicalId,legacy:[1,i+1,0.5],multilingual:[0.4,i+1,0.2],
}));
function seed(sqlite:DatabaseSync,epoch:number,lease:ArchiveLease){
 const oldLogical="map-"+"c".repeat(40);
 const oldStaged=immutableVectorId(lease,QA106_B_PDF_ID,"map",oldLogical,fp,epoch);
 sqlite.prepare(`INSERT INTO ingestion_v2_publications
  (document_id,job_key,active_generation,source_fingerprint,
   manifest_sha256,raw_count,evidence_count,map_count,published_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(QA106_A_PDF_ID,QA106_A_JOB,1,fp,
   "d".repeat(64),2,2,2,Date.now());
 const oldEntries=[
   {logicalId:oldLogical,stagedId:oldStaged},
   {logicalId:"map-"+"e".repeat(40),stagedId:immutableVectorId(
     lease,QA106_B_PDF_ID,"map","map-"+"e".repeat(40),fp,epoch)}
 ];
 sqlite.prepare(`INSERT INTO ingestion_v2_pending_map_windows
  (document_id,job_key,generation,source_fingerprint,window_key,
    map_version,ids_json,created_at_ms)
   VALUES (?,?,?,?,?,?,?,?)`).run(QA106_B_PDF_ID,QA106_B_JOB,epoch,fp,key,
    4,JSON.stringify(oldEntries),Date.now());
 sqlite.prepare(`INSERT INTO ingestion_v2_vector_receipts
  (document_id,generation,layer,logical_id,staged_id,
    source_fingerprint,created_at_ms)
   VALUES (?,?,?,?,?,?,?)`).run(QA106_B_PDF_ID,epoch,"map",
    oldLogical,oldStaged,fp,Date.now());
 for(let i=0;i<2;i++){
   const logical=`raw-${i}`;
   sqlite.prepare(`INSERT INTO ingestion_v2_vector_receipts
     (document_id,generation,layer,logical_id,staged_id,
      source_fingerprint,created_at_ms) VALUES (?,?,?,?,?,?,?)`)
      .run(QA106_B_PDF_ID,epoch,"raw",logical,
       immutableVectorId(lease,QA106_B_PDF_ID,"raw",logical,fp,epoch),
       fp,Date.now());
   sqlite.prepare(`INSERT INTO ingestion_v2_staged_evidence
      (document_id,generation,logical_id,source_fingerprint,
       text,file_name,source_path,page,chunk_index,created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(QA106_B_PDF_ID,epoch,
       "evidence-"+i,fp,"QA test evidence","synthetic-b.pdf",
       "qa/synthetic-b.pdf",i+1,i,Date.now());
 }
 return oldStaged;
}
async function setup(label:string){
 const f=fixture(label);
 const lease=await claimGlobalArchiveLease(f.db,QA106_B_JOB,
   "gh-45017130713-"+(label==="basic"?"a":"b").repeat(20));
 assert.ok(lease);
 const epoch=await claimDocumentStagingEpoch(
    f.db,lease!,QA106_B_PDF_ID,fp);
 assert.equal(epoch,1);
 const old=seed(f.sqlite,epoch!,lease!);
 const scope:RevisionScope={documentId:QA106_B_PDF_ID,jobKey:QA106_B_JOB,
    fingerprint:fp,documentEpoch:epoch!,revision:1,supersedesWindowKey:key};
 return {...f,lease:lease!,scope,old};
}
async function persistAll(f:Awaited<ReturnType<typeof setup>>){
 await beginShadowMapRevision(f.db,f.lease,f.scope);
 await persistGeneratedMapPayload(f.db,f.lease,f.scope,nodes);
 let snap=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(snap.state,"generated");
 await persistMapEmbeddings(f.db,f.lease,f.scope,embeds(snap.payload!.entries));
 snap=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(snap.state,"embedded");
 return snap;
}
try{
 const f=await setup("basic");
 const ix:[FakeIndex,FakeIndex]=[new FakeIndex(),new FakeIndex()];
 const rawBefore=f.count("SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE document_id=? AND layer='raw'",[QA106_B_PDF_ID]);
 const evidenceBefore=f.count("SELECT COUNT(*) AS n FROM ingestion_v2_staged_evidence WHERE document_id=?",[QA106_B_PDF_ID]);
 await beginShadowMapRevision(f.db,f.lease,f.scope);
 assert.equal((await readDurableShadowRevision(f.db,f.lease,f.scope)).state,"planned");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM qa106_map_revision_receipts"),0);
 // Crash BEFORE exact payload is durably saved: remains planned and no
 // phantom publication or receipts; generation must not auto-repeat.
 assert.equal(f.count("SELECT COUNT(*) AS n FROM qa106_map_revision_shadow_publications"),0);
 await persistGeneratedMapPayload(f.db,f.lease,f.scope,nodes);
 await persistGeneratedMapPayload(f.db,f.lease,f.scope,nodes);
 await assert.rejects(persistGeneratedMapPayload(f.db,f.lease,f.scope,
   [{...nodes[0],text:"Different regenerated answer"},{...nodes[1]}]),
   /GENERATED_PAYLOAD_CONFLICT_OR_STALE/);
 const generated=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(generated.state,"generated");
 assert.equal(generated.payload?.entries.length,2);
 assert.notEqual(generated.payload?.entries[0].stagedId,f.old);
 // Crash after durable payload, new owner: generation is NOT rerun; the
 // saved exact model text+IDs can be retrieved without model API calls.
 const release=await releaseGlobalArchiveLease(f.db,f.lease);
 assert.equal(release,true);
 const next=await claimGlobalArchiveLease(f.db,QA106_B_JOB,
    "gh-45017130714-"+"f".repeat(20));
 assert.ok(next&&next.generation>f.lease.generation);
 await assert.rejects(persistMapEmbeddings(f.db,f.lease,f.scope,
   embeds(generated.payload!.entries)),/EMBEDDING_CONFLICT_OR_STALE|STALE_OWNER/);
 f.lease=next!;
 const restored=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(restored.payload?.entries[0].text,nodes[0].text);
 await persistMapEmbeddings(f.db,f.lease,f.scope,
    embeds(restored.payload!.entries));
 const complete=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(complete.state,"embedded");
 // Crash AFTER both embeddings durable, BEFORE external index insert.
 // Zero model, zero embedding provider calls in all following operations.
 let externalModelCalls=0; // no callable provider is injected at all
 const first=complete.payload!.entries[0],vec=complete.embeddings!.embeddings[0];
 const m={...first.metadata,text:first.text,sourceFileId:QA106_B_PDF_ID,
  sourceFingerprint:fp,stagedGeneration:f.scope.documentEpoch,stagedLayer:"map",
  mapRevision:f.scope.revision};
 ix[0].record({id:first.stagedId,metadata:m,values:vec.legacy});
 ix[1].record({id:first.stagedId,metadata:m,values:vec.multilingual});
 // Prior remote dual-index write without D1 receipt must be reused.
 const result=await reconcileShadowMapRevision(f.db,f.lease,f.scope,ix);
 assert.deepEqual(result,{status:"complete",receipts:2});
 assert.equal(ix[0].inserts,1);
 assert.equal(ix[1].inserts,1);
 assert.equal(externalModelCalls,0);
 // The full physical pair is now staged, but there is no active D1
 // pointer. No Map candidate (including valid new ones) is visible yet.
 const candidates=[...ix[0].map.values()].map(v=>({
    id:v.id,metadata:structuredClone(v.metadata),
 }));
 const obsolete={id:f.old,metadata:{...m,mapRevision:0}};
 assert.deepEqual(await filterShadowVisibleMapVectors(
    f.db,[...candidates,obsolete],ix),[],
   "complete vectors must be invisible BEFORE the atomic pointer");
 const pub=await publishShadowMapRevision(f.db,f.lease,f.scope,ix);
 assert.equal(pub,true);
 assert.equal(await publishShadowMapRevision(f.db,f.lease,f.scope,ix),true);
 const active=await filterShadowVisibleMapVectors(
   f.db,[obsolete,candidates[0],candidates[1],candidates[0]],ix);
 assert.deepEqual(active.map(v=>v.id),candidates.map(v=>v.id),
   "ONLY active Map vectors are visible; old receipt and duplicate excluded");
 const wrongVersion={...candidates[0],metadata:{...candidates[0].metadata,
   mapRevision:2}};
 const wrongPage={...candidates[0],metadata:{...candidates[0].metadata,
   page:99}};
 const wrongFingerprint={...candidates[0],metadata:{...candidates[0].metadata,
   sourceFingerprint:"f".repeat(64)}};
 assert.deepEqual((await filterShadowVisibleMapVectors(f.db,
   [wrongVersion,wrongPage,wrongFingerprint,candidates[1]],ix))
   .map(v=>v.id),[candidates[1].id]);
 assert.deepEqual(await filterShadowVisibleMapVectors(
   undefined,candidates,ix),[],"no D1 means no fallback");
 const brokenDb={prepare:()=>{throw Error("QA106_TEST_D1_DOWN")}} as unknown as CoordinatorDB;
 assert.deepEqual(await filterShadowVisibleMapVectors(
   brokenDb,candidates,ix),[],"D1 exception fails closed");
 // Corruption of either Vectorize physical index hides the ENTIRE Map, not
 // just the one candidate that happened to be returned by search.
 const removed=ix[1].map.get(candidates[0].id)!;
 ix[1].map.delete(candidates[0].id);
 assert.deepEqual(await filterShadowVisibleMapVectors(
   f.db,candidates,ix),[],"half-index read must not leak the other Map");
 ix[1].record(removed);
 // Active pointer must match the immutable original manifest.
 const publishedSha=String(f.read("SELECT manifest_sha256 FROM qa106_map_revision_shadow_publications WHERE document_id=?",[QA106_B_PDF_ID])!.manifest_sha256);
 f.sqlite.prepare("UPDATE qa106_map_revision_shadow_publications SET manifest_sha256=? WHERE document_id=?")
   .run("f".repeat(64),QA106_B_PDF_ID);
 assert.deepEqual(await filterShadowVisibleMapVectors(f.db,candidates,ix),[]);
 f.sqlite.prepare("UPDATE qa106_map_revision_shadow_publications SET manifest_sha256=? WHERE document_id=?")
   .run(publishedSha,QA106_B_PDF_ID);
 // One extra or missing Map receipt cannot be treated as full publication.
 const firstReceipt=f.read("SELECT * FROM qa106_map_revision_receipts WHERE staged_id=?",[candidates[0].id])!;
 f.sqlite.prepare("DELETE FROM qa106_map_revision_receipts WHERE staged_id=?")
   .run(candidates[0].id);
 assert.deepEqual(await filterShadowVisibleMapVectors(f.db,candidates,ix),[]);
 f.sqlite.prepare(`INSERT INTO qa106_map_revision_receipts
 (document_id,staging_epoch,revision,logical_id,staged_id,
 source_fingerprint,created_at_ms) VALUES (?,?,?,?,?,?,?)`).run(
   firstReceipt.document_id as string,firstReceipt.staging_epoch as number,
   firstReceipt.revision as number,firstReceipt.logical_id as string,
   firstReceipt.staged_id as string,firstReceipt.source_fingerprint as string,
   firstReceipt.created_at_ms as number);
 assert.deepEqual((await filterShadowVisibleMapVectors(
   f.db,candidates,ix)).map(v=>v.id),candidates.map(v=>v.id));

 assert.equal(ix[0].inserts,1,"no duplicate Vectorize insertion");
 assert.equal(ix[1].inserts,1,"no duplicate Vectorize insertion");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM qa106_map_revision_receipts"),2);
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE document_id=? AND layer='map'",[QA106_B_PDF_ID]),1,
   "Old incomplete Map receipt must remain historical");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_pending_map_windows WHERE document_id=?",[QA106_B_PDF_ID]),1,
   "Old Map intent must remain historical");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_publications WHERE document_id=?",[QA106_A_PDF_ID]),1,
   "Published QA A must remain unchanged");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_publications WHERE document_id=?",[QA106_B_PDF_ID]),0,
   "SHADOW must not publish to real archive");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM qa106_map_revision_shadow_publications WHERE document_id=?",[QA106_B_PDF_ID]),1);
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE document_id=? AND layer='raw'",[QA106_B_PDF_ID]),rawBefore);
 assert.equal(f.count("SELECT COUNT(*) AS n FROM ingestion_v2_staged_evidence WHERE document_id=?",[QA106_B_PDF_ID]),evidenceBefore);
 const shadow=f.read("SELECT map_count,raw_count,evidence_count FROM qa106_map_revision_shadow_publications WHERE document_id=?",[QA106_B_PDF_ID]);
 assert.deepEqual([shadow?.map_count,shadow?.raw_count,shadow?.evidence_count],[2,2,2]);
 console.log("PASS: old Map intent retained, exact write-ahead payload+embeddings, successor lease, orphan readback, no model calls, shadow CAS only");
 // Changing the source revision invalidates the entire old shadow pointer.
 const changedEpoch=await claimDocumentStagingEpoch(f.db,f.lease,
   QA106_B_PDF_ID,"f".repeat(64));
 assert.ok(changedEpoch&&changedEpoch>f.scope.documentEpoch);
 assert.deepEqual(await filterShadowVisibleMapVectors(f.db,candidates,ix),[]);
 console.log("PASS: atomic shadow Map pointer, exact active revision/receipt/metadata, half-index, stale fingerprint and old Map exclusion");
 f.close();

 const g=await setup("half");
 await persistAll(g);
 const indexes:[FakeIndex,FakeIndex]=[new FakeIndex(),new FakeIndex()];
 const snap=await readDurableShadowRevision(g.db,g.lease,g.scope);
 const e=snap.payload!.entries[0],v=snap.embeddings!.embeddings[0];
 indexes[0].record({id:e.stagedId,values:v.legacy,
  metadata:{...e.metadata,text:e.text}});
 await assert.rejects(
    reconcileShadowMapRevision(g.db,g.lease,g.scope,indexes),
    /HALF_INDEX_PAIR/);
 assert.equal(g.count("SELECT COUNT(*) AS n FROM qa106_map_revision_receipts"),0);
 assert.equal(g.count("SELECT COUNT(*) AS n FROM qa106_map_revision_shadow_publications"),0);
 assert.equal(indexes[1].inserts,0);
 const wrongScope={...g.scope,documentId:QA106_A_PDF_ID};
 await assert.rejects(beginShadowMapRevision(g.db,g.lease,wrongScope),
    /SCOPE_DENIED/);
 await assert.rejects(persistGeneratedMapPayload(g.db,g.lease,
   {...g.scope,revision:2},nodes),/SCOPE_DENIED/);
 // Source revision flipped under the same lease; prior revision can never
 // receive a receipt or publication after document epoch changes.
 const bumped=await claimDocumentStagingEpoch(
    g.db,g.lease,QA106_B_PDF_ID,"f".repeat(64));
 assert.ok(bumped&&bumped>g.scope.documentEpoch);
 await assert.rejects(
    reconcileShadowMapRevision(g.db,g.lease,g.scope,indexes),
    /STALE_OWNER_OR_SOURCE/);
 assert.equal(g.count("SELECT COUNT(*) AS n FROM qa106_map_revision_shadow_publications"),0);
 console.log("PASS: half-Vectorize pair, wrong PDF/revision and source-fingerprint flip all fail closed");
 g.close();
}finally{
 rmSync(temp,{recursive:true,force:true});
}
