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
 reserveShadowProviderCall,advanceShadowMapRevisionWithProviders,
 type RevisionScope,type RevisionNode,
} from "./qa-issue106-map-revision-shadow.ts";
import {filterShadowVisibleMapVectors}
 from "./qa-issue106-map-revision-shadow-read.ts";
import {
 stageGenericMapCandidatePreview,activateGenericMapRevisionPreview,
 blockGenericMapRevisionPreview,filterGenericPublishedMapPreview,
 filterGenericPublishedRawPreview,readGenericPublishedEvidencePreview,
 type MapRevisionScope,
} from "./qa-issue106-generic-map-publication-preview.ts";
import {readGenericPublishedEvidenceByIds}
 from "../app/lib/ingestion-map-revision-visibility.ts";
import {revisionReadGatePreview}
 from "./qa-issue106-revision-reader-flag-preview.ts";
import {publishedArchiveEnv}
 from "../app/lib/ingestion-published-reader.ts";
import {searchPublishedRevisionEvidence}
 from "../app/lib/ingestion-map-revision-evidence.ts";
import {mergePublishedEvidenceRows,type ArchiveEvidenceRow}
 from "../app/lib/archive-evidence-index.ts";

const fp="a".repeat(64),key="b".repeat(64);
const temp=mkdtempSync(join(tmpdir(),"qa106-map-revision-offline-"));
const files=[
 "../docs/ingestion-global-coordinator-schema.sql",
 "../docs/ingestion-immutable-publication-schema.sql",
 "../docs/ingestion-v2-document-epoch-schema.sql",
 "../docs/ingestion-v2-pending-map-windows-schema.sql",
 "../docs/ingestion-v2-evidence-reference-schema.sql",
 "../docs/qa106-map-revision-shadow-schema.sql",
 "../docs/qa106-generic-map-revision-preview-schema.sql",
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
     all:async()=> ({results:sqlite.prepare(sql).all(...(args as any[])) as Array<Record<string,unknown>>}),
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
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"map_generation");
 await persistGeneratedMapPayload(f.db,f.lease,f.scope,nodes);
 let snap=await readDurableShadowRevision(f.db,f.lease,f.scope);
 assert.equal(snap.state,"generated");
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"workers_ai_embedding");
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"gemini_embedding");
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
 // A paid request must acquire one durable, never-repeat reservation
 // BEFORE leaving D1. A lost model response cannot trigger another charge.
 await assert.rejects(reserveShadowProviderCall(
   f.db,f.lease,f.scope,"gemini_embedding"),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/,
   "Embedding may not start before exact Map content is durably generated");
 await assert.rejects(persistGeneratedMapPayload(
   f.db,f.lease,f.scope,nodes),/GENERATED_PAYLOAD_CONFLICT_OR_STALE/,
   "Provider output cannot be persisted before the model reservation");
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"map_generation");
 await assert.rejects(reserveShadowProviderCall(
   f.db,f.lease,f.scope,"map_generation"),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/,
   "Never issue the same paid Map generation twice");
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
 await assert.rejects(reserveShadowProviderCall(
   f.db,f.lease,f.scope,"map_generation"),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/,
   "A successor lease cannot regenerate an already claimed Map request");
 await assert.rejects(persistMapEmbeddings(f.db,f.lease,f.scope,
   embeds(restored.payload!.entries)),/EMBEDDING_CONFLICT_OR_STALE/,
   "Provider output cannot be persisted before BOTH embedding reservations");
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"workers_ai_embedding");
 await reserveShadowProviderCall(f.db,f.lease,f.scope,"gemini_embedding");
 await assert.rejects(reserveShadowProviderCall(
   f.db,f.lease,f.scope,"workers_ai_embedding"),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/);
 await assert.rejects(reserveShadowProviderCall(
   f.db,f.lease,f.scope,"gemini_embedding"),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/);
 assert.equal(f.count(`SELECT COUNT(*) AS n FROM
   qa106_map_revision_provider_reservations WHERE document_id=?`,
   [QA106_B_PDF_ID]),3,
   "Exactly one Map generation, Gemini embed and Workers AI reservation");
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

 // Offline rollback drill: deleting ONLY the shadow activation pointer
 // hides every new vector immediately; durable payload/receipts survive.
 // Reattestation can restore the SAME shadow manifest without any providers.
 f.sqlite.prepare("DELETE FROM qa106_map_revision_shadow_publications WHERE document_id=?")
   .run(QA106_B_PDF_ID);
 assert.deepEqual(await filterShadowVisibleMapVectors(f.db,candidates,ix),[],
   "revoked atomic pointer must hide all Map matches");
 assert.equal(f.count("SELECT COUNT(*) AS n FROM qa106_map_revision_receipts"),2);
 assert.equal(await publishShadowMapRevision(f.db,f.lease,f.scope,ix),true);
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
 // PREVIEW OF A REAL GENERIC MAP PUBLICATION POINTER; still strictly
 // local SQLite + fake dual indices and NEVER calls production routes.
 // Seed one already-published A Map vector and D1 receipt to prove legacy
 // compatibility and no alteration of the published A manifest.
 const aLease={...f.lease,jobKey:QA106_A_JOB};
 const aLogical="map-"+"1".repeat(40);
 const aPhysical=immutableVectorId(aLease,QA106_A_PDF_ID,"map",aLogical,fp,1);
 const aMeta={
   sourceFileId:QA106_A_PDF_ID,sourceFingerprint:fp,
   stagedGeneration:1,stagedLayer:"map",status:"active",
   contentType:"document-map",text:"Grounded QA A original Map",
   fileName:"fixture-a.pdf",sourcePath:"qa/fixture-a.pdf",page:1,pageEnd:1,
 };
 const aHit={id:aPhysical,metadata:aMeta};
 f.sqlite.prepare(`INSERT INTO ingestion_v2_vector_receipts
 (document_id,generation,layer,logical_id,staged_id,source_fingerprint,created_at_ms)
 VALUES (?,?,?,?,?,?,?)`).run(QA106_A_PDF_ID,1,"map",aLogical,aPhysical,fp,Date.now());
 // Two complete, immutable RAW pairs already exist in B's old epoch.
 // They are reused by the new Map revision and never re-embedded.
 const bRaw=[0,1].map(i=>{
  const id=immutableVectorId(f.lease,QA106_B_PDF_ID,"raw",
    `raw-${i}`,fp,f.scope.documentEpoch);
  const metadata={
   sourceFileId:QA106_B_PDF_ID,sourceFingerprint:fp,
   stagedGeneration:f.scope.documentEpoch,stagedLayer:"raw",
   status:"active",contentType:"standard",
   text:`Exact B RAW sentence ${i}`,fileName:"synthetic-b.pdf",
   sourcePath:"qa/synthetic-b.pdf",page:i+1,chunkIndex:i,
  };
  const vec={id,metadata,values:[1,i,0.5]};
  ix[0].record(vec);ix[1].record(vec);
  return {id,metadata};
 });
 const aRawId=immutableVectorId(aLease,QA106_A_PDF_ID,"raw","raw-A",fp,1);
 const aRawMeta={
  sourceFileId:QA106_A_PDF_ID,sourceFingerprint:fp,
  stagedGeneration:1,stagedLayer:"raw",status:"active",
  contentType:"standard",text:"Legacy A exact source",
  fileName:"fixture-a.pdf",sourcePath:"qa/fixture-a.pdf",page:1,chunkIndex:0,
 };
 const aRawHit={id:aRawId,metadata:aRawMeta};
 f.sqlite.prepare(`INSERT INTO ingestion_v2_vector_receipts
 (document_id,generation,layer,logical_id,staged_id,source_fingerprint,created_at_ms)
 VALUES (?,?,?,?,?,?,?)`).run(QA106_A_PDF_ID,1,"raw","raw-A",aRawId,fp,Date.now());
 f.sqlite.prepare(`INSERT INTO ingestion_v2_staged_evidence
 (document_id,generation,logical_id,source_fingerprint,text,
 file_name,source_path,page,chunk_index,created_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?,?)`).run(QA106_A_PDF_ID,1,"evidence-A",
   fp,"Published A citation","fixture-a.pdf","qa/fixture-a.pdf",
   1,0,Date.now());
 assert.equal((await readGenericPublishedEvidencePreview(
   f.db,QA106_A_PDF_ID,ix)).length,1,
   "Existing legacy A evidence citations must remain readable");
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw],ix)).map(x=>x.id),[aRawId],
   "Unpublished B RAW is not exposed before revision activation");
 assert.deepEqual(await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix),[],
   "Unpublished B exact evidence must remain hidden");
  const bHit=candidates.map(c=>structuredClone(c));
 const currentA=await filterGenericPublishedMapPreview(f.db,[aHit],ix);
 assert.deepEqual(currentA.map(x=>x.id),[aPhysical],
   "Legacy published A remains readable with no revision candidate");
 const previewScope:MapRevisionScope={
  documentId:QA106_B_PDF_ID,jobKey:QA106_B_JOB,
  epoch:f.scope.documentEpoch,revision:f.scope.revision,fingerprint:fp,
 };
 const embeddingHash=String(f.read(`SELECT embeddings_sha256 FROM
   qa106_map_revisions WHERE document_id=?`,[QA106_B_PDF_ID])!.embeddings_sha256);
 const previewPayload={entries:complete.payload!.entries};
 await stageGenericMapCandidatePreview(
   f.db,f.lease,previewScope,previewPayload,embeddingHash,ix);
 assert.deepEqual((await filterGenericPublishedMapPreview(
   f.db,[aHit,...bHit,obsolete],ix)).map(x=>x.id),[aPhysical],
   "Pre-activation B new Map and old unfinished Map must both be hidden");
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw],ix)).map(x=>x.id),[aRawId]);
 assert.deepEqual(await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix),[]);
 assert.equal(await activateGenericMapRevisionPreview(
   f.db,f.lease,previewScope,ix),true);
 const candidatesExpected=[aPhysical,...bHit.map(x=>x.id)];
 assert.deepEqual((await filterGenericPublishedMapPreview(
   f.db,[obsolete,aHit,...bHit,bHit[0]],ix)).map(x=>x.id),
   candidatesExpected,
   "Atomic D1 activation makes ONLY new B revision visible alongside legacy A");
 const rawExpected=[aRawId,...bRaw.map(x=>x.id)];
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw,bRaw[0]],ix)).map(x=>x.id),rawExpected,
   "Active revision makes the original RAW B pair visible without reindexing");
 // A live rollback may happen while a remote Vectorize getByIds is
 // pending. Re-check D1 after readback for Map, RAW and exact Evidence;
 // otherwise a pre-rollback pointer could approve data after revocation.
 for(const path of ["map","raw","evidence"] as const){
   let revoked=false;
   const racingIndex:ImmutableIndex={
     insert:xs=>ix[0].insert(xs),
     getByIds:async ids=>{
       const found=await ix[0].getByIds(ids);
       if(!revoked&&ids.includes(bHit[0].id)){
         f.sqlite.prepare(`UPDATE ingestion_v2_map_revision_activations
           SET state='blocked' WHERE document_id=? AND state='active'`)
          .run(QA106_B_PDF_ID);
         revoked=true;
       }
       return found;
     },
   };
   const raceIndexes:[ImmutableIndex,ImmutableIndex]=[racingIndex,ix[1]];
   if(path==="map"){
     assert.deepEqual((await filterGenericPublishedMapPreview(
       f.db,[aHit,...bHit],raceIndexes)).map(x=>x.id),[aPhysical],
       "Mid-read rollback must revoke B Map without hiding published A");
   }else if(path==="raw"){
     assert.deepEqual((await filterGenericPublishedRawPreview(
       f.db,[aRawHit,...bRaw],raceIndexes)).map(x=>x.id),[aRawId],
       "Mid-read rollback must revoke B RAW without hiding published A");
   }else{
     assert.deepEqual(await readGenericPublishedEvidencePreview(
       f.db,QA106_B_PDF_ID,raceIndexes),[],
       "Mid-read rollback must revoke B exact Evidence");
   }
   assert.equal(revoked,true,"Test must actually revoke during Map readback");
   assert.equal(await activateGenericMapRevisionPreview(
     f.db,f.lease,previewScope,ix),true,
     "Reattestation restores the exact same pointer without model calls");
 }
 console.log("PASS: concurrent rollback during Vectorize readback revokes Map, RAW and Evidence");
 // Disabled-by-default reader integration must preserve original env
 // identity. Enabled path is an OFFLINE adapter, not the live /api/ask.
 const candidatesFromIndex=[aHit,...bHit,obsolete,aRawHit,...bRaw];
 const originalPort=(index:0|1)=>({
    query:async (..._args:unknown[])=>({matches:candidatesFromIndex}),
    getByIds:async(ids:string[])=>candidatesFromIndex.filter(x=>ids.includes(x.id)),
    insert:async()=>{throw Error("QA106_TEST_READ_ADAPTER_WRITE_DENIED")},
 });
 const previewBase={
   CORTEX_DB:f.db,VECTORIZE:originalPort(0),VECTORIZE_V2:originalPort(1),
 };
 assert.equal(revisionReadGatePreview(previewBase),previewBase,
   "absent feature flag leaves original production-compatible object unchanged");
 const withFlag=revisionReadGatePreview({
  ...previewBase,INGESTION_MAP_REVISION_READS_PREVIEW_ENABLED:"true",
 }) as unknown as typeof previewBase&{
  readExactEvidence:(doc:string,limit?:number)=>Promise<unknown[]>;
 };
 // Production entrypoint CODE is now wired only behind an EXTRA flag.
 // These tests run solely on synthetic SQLite and fake Vectorize.
 const liveEntryDisabled={...previewBase,INGESTION_PUBLISHED_READS_ENABLED:"false",
   INGESTION_MAP_REVISION_READS_ENABLED:"false"};
 assert.equal(publishedArchiveEnv(liveEntryDisabled),liveEntryDisabled,
   "Both flags off must preserve original Production environment identity");
 const liveEntryWrongOrder=publishedArchiveEnv({
   ...previewBase,INGESTION_PUBLISHED_READS_ENABLED:"false",
   INGESTION_MAP_REVISION_READS_ENABLED:"true",
 });
 assert.deepEqual((await liveEntryWrongOrder.VECTORIZE.query()).matches,[],
   "revision flag without published gate must fail closed");
 const productionAdapter=publishedArchiveEnv({
    ...previewBase,INGESTION_PUBLISHED_READS_ENABLED:"true",
    INGESTION_MAP_REVISION_READS_ENABLED:"true",
 }) as unknown as typeof previewBase&{
   CORTEX_DB:typeof f.db&{__mapRevisionReadGate:boolean;__immutableReadGate:boolean};
 };
 assert.equal(productionAdapter.CORTEX_DB.__mapRevisionReadGate,true);
 assert.equal(productionAdapter.CORTEX_DB.__immutableReadGate,true);
 assert.deepEqual((await productionAdapter.VECTORIZE.query()).matches?.map(x=>x.id),
   [aHit.id,...bHit.map(x=>x.id),aRawHit.id,...bRaw.map(x=>x.id)],
   "reviewed adapter must gate real query exactly as offline preview");
 assert.deepEqual((await productionAdapter.VECTORIZE_V2.getByIds(
   candidatesFromIndex.map(x=>x.id))).map(x=>x.id),
   [aHit.id,...bHit.map(x=>x.id),aRawHit.id,...bRaw.map(x=>x.id)],
   "reviewed adapter must gate real getByIds on both indexes");
 const gated=await withFlag.VECTORIZE.query();
 assert.deepEqual(gated.matches?.map(x=>x.id),
   [aHit.id,...bHit.map(x=>x.id),aRawHit.id,...bRaw.map(x=>x.id)],
   "query must filter obsolete B map, keep legacy A and revision B RAW/Map");
 const byId=await withFlag.VECTORIZE_V2.getByIds(
  candidatesFromIndex.map(x=>x.id));
 assert.deepEqual(byId.map(x=>x.id),
   gated.matches?.map(x=>x.id),
   "getByIds requires same exact revision visibility as query");
 assert.equal((await withFlag.readExactEvidence(QA106_B_PDF_ID)).length,2,
   "revision evidence uses only the same authoritative active pointer");
 const unavailable=revisionReadGatePreview({
  ...previewBase,INGESTION_MAP_REVISION_READS_PREVIEW_ENABLED:"true",
  CORTEX_DB:undefined,VECTORIZE_V2:undefined,
 }) as unknown as typeof previewBase&{
  readExactEvidence:(doc:string)=>Promise<unknown[]>;
 };
 assert.deepEqual((await unavailable.VECTORIZE.query()).matches,[],
  "missing D1 or one index must fail closed, never fall back to unfiltered data");
 assert.deepEqual(await unavailable.VECTORIZE.getByIds([aHit.id]),[]);
 assert.deepEqual(await unavailable.readExactEvidence(QA106_B_PDF_ID),[]);
  // Exact published clause citations must be from B's active revision,
 // not merely from its historical staged Evidence or the old index.
 const refs=[{key:"EN8120",label:"EN 81-20",structured:true}];
 for(let i=0;i<2;i++){
   f.sqlite.prepare(`INSERT INTO ingestion_v2_evidence_terms
      (document_id,generation,logical_id,source_fingerprint,kind,
       term_key,label,created_at_ms) VALUES (?,?,?,?,?,?,?,?)`)
      .run(QA106_B_PDF_ID,f.scope.documentEpoch,
       "evidence-"+i,fp,"reference",refs[0].key,refs[0].label,Date.now());
 }
 const cited=await searchPublishedRevisionEvidence(f.db,refs,[],ix,60);
 assert.deepEqual(cited.map(v=>v.page),[1,2],
   "active B source pages must be citeable after revision activation");
 assert.deepEqual(await searchPublishedRevisionEvidence(f.db,[
   {key:"UNKNOWN",label:"Unknown",structured:false}],[],ix,60),[],
   "unrelated reference cannot become an authoritative B citation");
 const guardedD1=Object.assign(Object.create(f.db),{
   __immutableReadGate:true,
   __mapRevisionReadGate:true,
   __mapRevisionIndexes:ix,
 });
 const staleB:ArchiveEvidenceRow={
   id:"legacy-b-stale",text:"stale synthetic B citation",
   source_file_id:QA106_B_PDF_ID,file_name:"synthetic-b.pdf",
   source_path:"qa/synthetic-b.pdf",page:200,chunk_index:0,
   content_type:"standard",source_fingerprint:fp,
   identifier_labels:refs[0].label,matched_identifiers:1,
 };
 const untouchedLegacy:ArchiveEvidenceRow={
   ...staleB,id:"legacy-c",text:"synthetic unindexed C",
   source_file_id:"unpublished-legacy-C",page:3,
 };
 const mergedEvidence=await mergePublishedEvidenceRows(
   guardedD1,[staleB,untouchedLegacy],refs,[],60);
 assert.deepEqual(mergedEvidence.map(x=>x.page),[1,2,3],
   "real Evidence merge must include only two revised B pages and valid untouched C");
 assert.ok(!mergedEvidence.some(x=>x.id===staleB.id),
   "old legacy B Evidence must stay invisible even if archive_chunks returned it");
 const bCitations=await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix);
 assert.equal(bCitations.length,2);
 assert.deepEqual(bCitations.map(x=>x.page),[1,2]);
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[{...bRaw[0],metadata:{...bRaw[0].metadata,page:100}},bRaw[1]],ix))
   .map(x=>x.id),[bRaw[1].id],
   "Forged RAW page must never become an authoritative citation");
  assert.equal(f.count(`SELECT COUNT(*) AS n FROM
   ingestion_v2_map_revision_receipts WHERE document_id=?`,
   [QA106_B_PDF_ID]),2);
 assert.equal(f.count(`SELECT COUNT(*) AS n FROM
   ingestion_v2_publications WHERE document_id=?`,[QA106_B_PDF_ID]),0,
   "Generic preview MUST NOT mutate existing live publication");
 // Revision receipt loss invalidates the whole B Map but leaves A visible.
 f.sqlite.prepare(`DELETE FROM ingestion_v2_map_revision_receipts
  WHERE staged_id=?`).run(bHit[0].id);
 assert.deepEqual((await filterGenericPublishedMapPreview(
   f.db,[aHit,...bHit],ix)).map(x=>x.id),[aPhysical]);
 await stageGenericMapCandidatePreview(
    f.db,f.lease,previewScope,previewPayload,embeddingHash,ix);
 assert.deepEqual((await filterGenericPublishedMapPreview(
    f.db,[aHit,...bHit],ix)).map(x=>x.id),candidatesExpected);
 // One missing Vectorize mirror invalidates B; no partial Map surfaced.
 const left=ix[1].map.get(bHit[0].id)!;
 ix[1].map.delete(bHit[0].id);
 assert.deepEqual((await filterGenericPublishedMapPreview(
    f.db,[aHit,...bHit],ix)).map(x=>x.id),[aPhysical]);
 ix[1].record(left);
 assert.equal(await blockGenericMapRevisionPreview(
    f.db,f.lease,previewScope),true);
 assert.deepEqual((await filterGenericPublishedMapPreview(
    f.db,[aHit,...bHit,obsolete],ix)).map(x=>x.id),[aPhysical],
    "Rollback blocks B without exposing an old Map or affecting legacy A");
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw],ix)).map(x=>x.id),[aRawId],
   "B RAW must hide immediately on revision rollback");
 assert.deepEqual(await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix),[],
   "B Evidence must hide immediately on revision rollback");
 assert.equal((await readGenericPublishedEvidencePreview(
   f.db,QA106_A_PDF_ID,ix)).length,1);
 assert.deepEqual((await withFlag.VECTORIZE.query()).matches?.map(x=>x.id),
   [aHit.id,aRawHit.id],
   "opted-in query must hide B Map+RAW immediately after atomic rollback");
 assert.deepEqual((await productionAdapter.VECTORIZE.query()).matches?.map(x=>x.id),
   [aHit.id,aRawHit.id],
   "real code's default-off revision adapter must suppress B during rollback");

 assert.deepEqual(await withFlag.readExactEvidence(QA106_B_PDF_ID),[]);
 assert.deepEqual(await searchPublishedRevisionEvidence(f.db,refs,[],ix,60),[],
   "rollback of active revision must also revoke B identifier citations");
 assert.deepEqual((await mergePublishedEvidenceRows(
   guardedD1,[staleB,untouchedLegacy],refs,[],60)).map(x=>x.id),
   ["legacy-c"],"blocked B pointer must reject stale legacy and revised citations");

 
 assert.equal(await activateGenericMapRevisionPreview(
   f.db,f.lease,previewScope,ix),true,
   "Same complete immutable revision can be restored without providers");
 assert.deepEqual((await filterGenericPublishedMapPreview(
   f.db,[aHit,...bHit],ix)).map(x=>x.id),candidatesExpected);
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw],ix)).map(x=>x.id),rawExpected);
 assert.equal((await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix)).length,2);
 console.log("PASS: generic map activation CAS, legacy A compatibility, no B legacy fallback, revision receipt/index corruption and rollback");
 const shadow=f.read("SELECT map_count,raw_count,evidence_count FROM qa106_map_revision_shadow_publications WHERE document_id=?",[QA106_B_PDF_ID]);
 assert.deepEqual([shadow?.map_count,shadow?.raw_count,shadow?.evidence_count],[2,2,2]);
 console.log("PASS: old Map intent retained, exact write-ahead payload+embeddings, successor lease, orphan readback, no model calls, shadow CAS only");
 // Changing the source revision invalidates the entire old shadow pointer.
 const changedEpoch=await claimDocumentStagingEpoch(f.db,f.lease,
   QA106_B_PDF_ID,"f".repeat(64));
 assert.ok(changedEpoch&&changedEpoch>f.scope.documentEpoch);
 assert.deepEqual(await filterShadowVisibleMapVectors(f.db,candidates,ix),[]);
 assert.deepEqual((await filterGenericPublishedMapPreview(
   f.db,[aHit,...bHit],ix)).map(x=>x.id),[aPhysical],
   "stale source epoch must hide B map but preserve A");
 assert.deepEqual((await filterGenericPublishedRawPreview(
   f.db,[aRawHit,...bRaw],ix)).map(x=>x.id),[aRawId]);
 assert.deepEqual(await readGenericPublishedEvidencePreview(
   f.db,QA106_B_PDF_ID,ix),[]);
 console.log("PASS: atomic shadow Map pointer, exact active revision/receipt/metadata, half-index, stale fingerprint and old Map exclusion");
 f.close();



 // Regression: a published reference on page 260 must NOT disappear
 // merely because the old page-ordered Evidence preview took 250 rows.
 // All source epochs, 260 Evidence logical IDs, A/B leases and both
 // physical Map indexes are real SQLite + independent FakeIndex proofs.
 const huge=await setup("many-evidence");
 const hugeIndexes:[FakeIndex,FakeIndex]=[new FakeIndex(),new FakeIndex()];
 const hugeSnap=await persistAll(huge);
 assert.equal(await publishShadowMapRevision(
   huge.db,huge.lease,huge.scope,hugeIndexes),true);
 for(let i=2;i<260;i++){
   huge.sqlite.prepare(`INSERT INTO ingestion_v2_staged_evidence
   (document_id,generation,logical_id,source_fingerprint,text,
    file_name,source_path,page,chunk_index,created_at_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
     QA106_B_PDF_ID,huge.scope.documentEpoch,`evidence-${i}`,fp,
     `Grounded QA page ${i+1}`,"synthetic-b.pdf",
     "qa/synthetic-b.pdf",i+1,i,Date.now());
 }
 huge.sqlite.prepare(`INSERT INTO ingestion_v2_evidence_terms
   (document_id,generation,logical_id,source_fingerprint,kind,
    term_key,label,created_at_ms) VALUES (?,?,?,?,?,?,?,?)`)
    .run(QA106_B_PDF_ID,huge.scope.documentEpoch,"evidence-259",
         fp,"reference","EN8120","EN 81-20",Date.now());
 const hugeScope:MapRevisionScope={
   documentId:QA106_B_PDF_ID,jobKey:QA106_B_JOB,
   epoch:huge.scope.documentEpoch,revision:1,fingerprint:fp,
 };
 const hugeHash=String(huge.read(`SELECT embeddings_sha256
    FROM qa106_map_revisions WHERE document_id=?`,
    [QA106_B_PDF_ID])!.embeddings_sha256);
 await stageGenericMapCandidatePreview(
   huge.db,huge.lease,hugeScope,hugeSnap.payload!,hugeHash,hugeIndexes);
 assert.equal(await activateGenericMapRevisionPreview(
   huge.db,huge.lease,hugeScope,hugeIndexes),true);
 assert.equal((await readGenericPublishedEvidencePreview(
   huge.db,QA106_B_PDF_ID,hugeIndexes,250)).length,250);
 const exactHuge=await readGenericPublishedEvidenceByIds(
   huge.db,QA106_B_PDF_ID,["evidence-259"],hugeIndexes);
 assert.deepEqual(exactHuge.map(x=>x.page),[260]);
 const citedHuge=await searchPublishedRevisionEvidence(
   huge.db,[{key:"EN8120",label:"EN 81-20",structured:true}],
   [],hugeIndexes,60);
 assert.deepEqual(citedHuge.map(x=>x.page),[260],
   "Exact citation on page 260 is valid despite first-250 preview cap");
 assert.equal(await blockGenericMapRevisionPreview(
   huge.db,huge.lease,hugeScope),true);
 assert.deepEqual(await readGenericPublishedEvidenceByIds(
   huge.db,QA106_B_PDF_ID,["evidence-259"],hugeIndexes),[]);
 assert.deepEqual(await searchPublishedRevisionEvidence(
   huge.db,[{key:"EN8120",label:"EN 81-20",structured:true}],
   [],hugeIndexes,60),[],
   "Blocked active revision must fail closed on exact page 260");
 huge.close();
 console.log("PASS: exact active-revision citation beyond 250 Evidence rows, rollback fails closed");

 // End-to-end QA-only orchestration with mock providers and real SQLite CAS.
 // First invocation performs one generation, two embeddings, dual fake Vectorize
 // insert/attestation and shadow publish; repeats must make ZERO provider calls.
 const runner=await setup("runner");
 const runnerIx:[FakeIndex,FakeIndex]=[new FakeIndex(),new FakeIndex()];
 const counters={generation:0,workers:0,gemini:0};
 const providers={
   generate:async()=>{counters.generation++;return nodes;},
   workersEmbedding:async(texts:string[])=>{
     counters.workers++;return texts.map((_,i)=>[1,i+1,0.5]);
   },
   geminiEmbedding:async(texts:string[])=>{
     counters.gemini++;return texts.map((_,i)=>[0.4,i+1,0.2]);
   },
 };
 const runOnce=await advanceShadowMapRevisionWithProviders(
   runner.db,runner.lease,runner.scope,providers,runnerIx);
 assert.deepEqual(runOnce,{status:"shadow_published",providerCalls:3});
 assert.deepEqual(counters,{generation:1,workers:1,gemini:1});
 assert.deepEqual(await advanceShadowMapRevisionWithProviders(
   runner.db,runner.lease,runner.scope,providers,runnerIx),
   {status:"shadow_published",providerCalls:0});
 assert.deepEqual(counters,{generation:1,workers:1,gemini:1},
   "Repeated QA runner must not spend again after durable embedding");
 runner.close();

 // Unknown outcome of a reserved model call is NOT an invitation to retry:
 // the recovery caller must fail closed before contacting the provider.
 const uncertain=await setup("uncertain");
 const uncertainIx:[FakeIndex,FakeIndex]=[new FakeIndex(),new FakeIndex()];
 let attempted=0;
 const uncertainProviders={
   ...providers,
   generate:async():Promise<RevisionNode[]>=>{
     attempted++;throw Error("QA106_TEST_PROVIDER_UNCERTAIN_OUTCOME");
   },
 };
 await assert.rejects(advanceShadowMapRevisionWithProviders(
   uncertain.db,uncertain.lease,uncertain.scope,
   uncertainProviders,uncertainIx),
   /QA106_TEST_PROVIDER_UNCERTAIN_OUTCOME/);
 await assert.rejects(advanceShadowMapRevisionWithProviders(
   uncertain.db,uncertain.lease,uncertain.scope,
   uncertainProviders,uncertainIx),
   /PROVIDER_ALREADY_RESERVED_OR_STALE/,
   "Never retry uncertain paid request");
 assert.equal(attempted,1);
 assert.equal(uncertain.count(
   "SELECT COUNT(*) AS n FROM qa106_map_revision_provider_reservations"),1);
 uncertain.close();
 console.log("PASS: B-only orchestrator exact reservations, durable no-spend resume and uncertain-call fail-closed");

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
