import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {claimGlobalArchiveLease,type CoordinatorDB} from "../app/lib/ingestion-global-coordinator.ts";
import {claimDocumentStagingEpoch} from "../app/lib/ingestion-document-staging-epoch.ts";
import {immutableVectorId,stageImmutableVectorPair,stageImmutableExactEvidence,
  publishImmutableThreeLayerGeneration,readPublishedImmutableEvidence} from
 "../app/lib/ingestion-immutable-publication.ts";
import {stageImmutableEvidenceReferenceTerms,searchPublishedImmutableEvidence}
 from "../app/lib/ingestion-v2-evidence-references.ts";
import {standardReferenceIdentifiers} from "../app/lib/reference-identifiers.ts";

const dir=mkdtempSync(join(tmpdir(),"durable-document-epoch-"));
const file=join(dir,"coord.sqlite");
const a=new DatabaseSync(file),b=new DatabaseSync(file);
const adapt=(sqlite:DatabaseSync):CoordinatorDB=>({
 prepare:(sql:string)=>({
  bind:(...values:unknown[])=>({
    bind:()=>{throw Error("REBIND_BLOCKED");},
    first:async()=>sqlite.prepare(sql).get(...(values as any[])) as Record<string,unknown>|null ?? null,
  }),
  first:async()=>{throw Error("BIND_REQUIRED");},
 }),
});
const dbA=adapt(a),dbB=adapt(b);
const evidenceDB={prepare:(sql:string)=>({
 bind:(...values:unknown[])=>({
  all:async()=>({results:a.prepare(sql).all(...(values as any[])) as Record<string,unknown>[]}),
 }),
})};
const root="drive:1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5",doc="fictional-shared-pdf";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa",ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const t=Date.now();
class PhysicalIndex {
 map=new Map<string,any>();
 async insert(vs:any[]){for(const v of vs){if(!this.map.has(v.id))this.map.set(v.id,structuredClone(v));}}
 async getByIds(ids:string[]){return ids.map(id=>this.map.get(id)).filter(Boolean).map(v=>structuredClone(v));}
}
const legacy=new PhysicalIndex(),multi=new PhysicalIndex();
const vector=(id:string,fp:string,kind:"raw"|"map")=>({
 logicalId:id,sourceFingerprint:fp,legacyValues:[1,0],multilingualValues:[0,1],
 metadata:{sourcePath:"qa/fictional.pdf",fileName:"EN 81-20.pdf",
   text:"EN 81-20 clause 5.4.7.3 synthetic example source text.",
   page:7,status:"active",chunkIndex:kind==="raw"?0:-1,
   ...(kind==="raw"?{contentType:"standard"}:{contentType:"document-map",pageEnd:7})},
});
const ev=(id:string,fp:string)=>({
 logicalId:id,sourceFingerprint:fp,text:"EN 81-20 clause 5.4.7.3 synthetic evidence.",
 fileName:"EN 81-20.pdf",sourcePath:"qa/fictional.pdf",page:7,chunkIndex:0,
});
try{
 const schema=(path:string)=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8");
 a.exec(schema("../docs/ingestion-global-coordinator-schema.sql"));
 a.exec(schema("../docs/ingestion-immutable-publication-schema.sql"));
 a.exec(schema("../docs/ingestion-v2-evidence-reference-schema.sql"));
 a.exec(schema("../docs/ingestion-v2-document-epoch-schema.sql"));
 const leaseA=await claimGlobalArchiveLease(dbA,root,ownerA,180_000,t);
 assert.ok(leaseA);assert.equal(leaseA.generation,1);
 const epoch1=await claimDocumentStagingEpoch(dbA,leaseA,doc,"source-rev-a",t+1);
 assert.equal(epoch1,1);
 assert.equal(await claimDocumentStagingEpoch(dbA,leaseA,doc,"source-rev-a",t+2),1);
 const raw1=await stageImmutableVectorPair(dbA,leaseA,doc,"raw",
   vector("raw-a","source-rev-a","raw"),[legacy,multi],Date.now(),epoch1!);
 assert.ok(await stageImmutableExactEvidence(dbA,leaseA,doc,ev("e-a","source-rev-a"),Date.now(),epoch1!));
 assert.ok((await stageImmutableEvidenceReferenceTerms(dbA,leaseA,doc,
    ev("e-a","source-rev-a"),Date.now(),epoch1!))>0);
 const refs=standardReferenceIdentifiers(["EN 81-20"]);
 assert.deepEqual(await searchPublishedImmutableEvidence(evidenceDB,refs,["5.4.7.3"],60),[],
   "half-finished document never visible");

 // New scheduled run starts after lease expiry: document stage epoch remains 1.
 a.prepare("UPDATE ingestion_global_leases SET lease_until_ms=? WHERE job_key=?").run(t-1,root);
 const leaseB=await claimGlobalArchiveLease(dbB,root,ownerB,180_000,t+3);
 assert.ok(leaseB);assert.equal(leaseB.generation,2);
 const epochResumed=await claimDocumentStagingEpoch(dbB,leaseB,doc,"source-rev-a",t+4);
 assert.equal(epochResumed,epoch1,"same source revision resumes across root lease changes");
 assert.equal(immutableVectorId(leaseA,doc,"raw","raw-a","source-rev-a",epoch1!),
    immutableVectorId(leaseB,doc,"raw","raw-a","source-rev-a",epochResumed!),
    "physical vector identity does NOT depend on the short-lived owner");
 assert.equal(await stageImmutableExactEvidence(dbA,leaseA,doc,ev("late-e","source-rev-a"),
   Date.now(),epoch1!),false,"old lease cannot stage even if source epoch is same");
 const map1=await stageImmutableVectorPair(dbB,leaseB,doc,"map",
   vector("map-a","source-rev-a","map"),[legacy,multi],Date.now(),epochResumed!);
 assert.ok(map1);
 assert.equal(await publishImmutableThreeLayerGeneration(dbB,leaseB,doc,{
   rawIds:["raw-a"],evidenceIds:["e-a"],mapIds:["map-a"],sourceFingerprint:"source-rev-a",
 },Date.now(),epochResumed!),true,"successor owner can finish predecessor's partial document");
 assert.equal(a.prepare("SELECT active_generation AS gen FROM ingestion_v2_publications WHERE document_id=?")
   .get(doc)?.gen,epoch1);
 assert.equal((await readPublishedImmutableEvidence(evidenceDB,doc)).length,1);
 assert.equal((await searchPublishedImmutableEvidence(evidenceDB,refs,["5.4.7.3"],60)).length,1);

 // Different source fingerprint changes DOCUMENT epoch without changing owner.
 const epoch2=await claimDocumentStagingEpoch(dbB,leaseB,doc,"source-rev-b",t+5);
 assert.equal(epoch2,2,"revision change advances durable document epoch");
 assert.equal(await claimDocumentStagingEpoch(dbB,leaseB,doc,"source-rev-b",t+6),2);
 assert.equal(await stageImmutableExactEvidence(dbB,leaseB,doc,ev("stale-old","source-rev-a"),
   Date.now(),epoch1!),false,"outdated document epoch cannot stage D1 Evidence");
 await assert.rejects(stageImmutableVectorPair(dbB,leaseB,doc,"raw",
   vector("stale-physical","source-rev-a","raw"),[legacy,multi],Date.now(),epoch1!),
   /STAGED_VECTOR_RECEIPT_DENIED/,"outdated epoch may write a physical orphan but no receipt");
 assert.equal(a.prepare("SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts WHERE logical_id=?")
    .get("stale-physical")?.n,0);
 assert.equal((await readPublishedImmutableEvidence(evidenceDB,doc)).length,1,
   "last completed generation stays available while new revision stages");

 await stageImmutableVectorPair(dbB,leaseB,doc,"raw",
   vector("raw-b","source-rev-b","raw"),[legacy,multi],Date.now(),epoch2!);
 await stageImmutableVectorPair(dbB,leaseB,doc,"map",
   vector("map-b","source-rev-b","map"),[legacy,multi],Date.now(),epoch2!);
 assert.ok(await stageImmutableExactEvidence(dbB,leaseB,doc,ev("e-b","source-rev-b"),
   Date.now(),epoch2!));
 assert.ok((await stageImmutableEvidenceReferenceTerms(dbB,leaseB,doc,
    ev("e-b","source-rev-b"),Date.now(),epoch2!))>0);
 assert.equal(await publishImmutableThreeLayerGeneration(dbB,leaseB,doc,{
   rawIds:["raw-b"],evidenceIds:["e-b"],mapIds:["map-b"],sourceFingerprint:"source-rev-b",
 },Date.now(),epoch2!),true,"new revision epoch publishes in same root lease generation");
 const results=await searchPublishedImmutableEvidence(evidenceDB,refs,["5.4.7.3"],60);
 assert.deepEqual(results.map(x=>x.id),["e-b"],"old citation page hidden after revision publish");
 assert.equal((await readPublishedImmutableEvidence(evidenceDB,doc))[0].logicalId,"e-b");
 assert.equal(await publishImmutableThreeLayerGeneration(dbB,leaseB,doc,{
   rawIds:["raw-a"],evidenceIds:["e-a"],mapIds:["map-a"],sourceFingerprint:"source-rev-a",
 },Date.now(),epoch1!),false,"old stage epoch cannot republish");
 console.log("PASS: source epoch survives owner rotation, preserves partial RAW/Evidence, forbids stale receipt, revisions monotonic, exact citations switch atomically");
}finally{
 a.close();b.close();rmSync(dir,{recursive:true,force:true});
}
