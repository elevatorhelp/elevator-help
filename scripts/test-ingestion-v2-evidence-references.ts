import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {claimGlobalArchiveLease} from "../app/lib/ingestion-global-coordinator.ts";
import {stageImmutableExactEvidence,stageImmutableVectorPair,
 publishImmutableThreeLayerGeneration} from "../app/lib/ingestion-immutable-publication.ts";
import {stageImmutableEvidenceReferenceTerms,
 searchPublishedImmutableEvidence} from "../app/lib/ingestion-v2-evidence-references.ts";
import {searchArchiveEvidenceIndex} from "../app/lib/archive-evidence-index.ts";
import {standardReferenceIdentifiers} from "../app/lib/reference-identifiers.ts";

const temp=mkdtempSync(join(tmpdir(),"v2-evidence-lookup-"));
const a=new DatabaseSync(join(temp,"db.sqlite"));
const b=new DatabaseSync(join(temp,"db.sqlite"));
const make=(db:DatabaseSync)=>({
 prepare:(sql:string)=>({
  first:async()=>{throw Error("BIND_REQUIRED");},
  bind:(...args:unknown[])=>({
   bind:()=>{throw Error("REBIND_BLOCKED");},
   first:async()=>db.prepare(sql).get(...(args as any[])) as Record<string,unknown>||null,
   all:async()=>({results:sql.includes("WITH matched AS")?
     []:db.prepare(sql).all(...(args as any[])) as Record<string,unknown>[]}),
  }),
 }),
});
const dbA=make(a),dbB=make(b);
const root="drive:1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5",doc="fictional-standards-pdf";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const vec=(kind:"raw"|"map",logicalId:string,fp:string)=>({
 logicalId,sourceFingerprint:fp,legacyValues:[0.1,0.2],
 multilingualValues:[0.3,0.4],metadata:{
   status:"active",text:"EN 81-20 Section 5.4.7.3 example text",
   sourcePath:"qa/standards.pdf",fileName:"EN 81-20.pdf",
   page:7,chunkIndex:kind==="raw"?0:-1,
   ...(kind==="map"?{contentType:"document-map",pageEnd:8}:
      {contentType:"standard"}),
 },
});
const evidence=(logicalId:string,fp:string)=>({
 logicalId,sourceFingerprint:fp,
 text:"According to EN 81-20, clause 5.4.7.3 describes a safety railing.",
 fileName:"EN 81-20.pdf",sourcePath:"qa/standards.pdf",page:7,chunkIndex:0,
});
class FakeIndex{
 vectors=new Map<string,any>();
 async insert(xs:any[]){for(const x of xs)this.vectors.set(x.id,x);}
 async getByIds(ids:string[]){return ids.map(x=>this.vectors.get(x)).filter(Boolean);}
}
const idx0=new FakeIndex(),idx1=new FakeIndex();
const idents=standardReferenceIdentifiers(["EN 81-20"]);
try{
  a.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-global-coordinator-schema.sql",import.meta.url)),"utf8"));
  a.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-immutable-publication-schema.sql",import.meta.url)),"utf8"));
  a.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-v2-evidence-reference-schema.sql",import.meta.url)),"utf8"));
  const t=Date.now(),lease=await claimGlobalArchiveLease(dbA,root,ownerA,180_000,t);
  assert.ok(lease);
  assert.equal(await stageImmutableExactEvidence(dbA,lease,doc,evidence("e-a","rev-a")),true);
  assert.ok((await stageImmutableEvidenceReferenceTerms(dbA,lease,doc,evidence("e-a","rev-a")))>0);
  assert.deepEqual(await searchPublishedImmutableEvidence(dbB,idents,["5.4.7.3"],60),[],
    "staged but unpublished Evidence must never be discoverable");
  await stageImmutableVectorPair(dbA,lease,doc,"raw",vec("raw","r-a","rev-a"),[idx0,idx1]);
  await stageImmutableVectorPair(dbA,lease,doc,"map",vec("map","m-a","rev-a"),[idx0,idx1]);
  assert.equal(await publishImmutableThreeLayerGeneration(dbA,lease,doc,{
    rawIds:["r-a"],evidenceIds:["e-a"],mapIds:["m-a"],sourceFingerprint:"rev-a",
  }),true);
  const found=await searchPublishedImmutableEvidence(dbB,idents,["5.4.7.3"],60);
  assert.equal(found.length,1);
  assert.equal(found[0].page,7);assert.equal(found[0].source_file_id,doc);
  assert.equal(found[0].source_fingerprint,"rev-a");
  assert.deepEqual(await searchPublishedImmutableEvidence(dbB,idents,["5.4.7.99"],60),[],
    "wrong exact clause must not match");
  const dbForUnified={...dbB,__immutableReadGate:true};
  const unified=await searchArchiveEvidenceIndex(dbForUnified,idents,["5.4.7.3"],60);
  assert.equal(unified.length,1,"generic citation retrieval must discover new published Evidence");
  assert.equal(unified[0].page,7);
  a.prepare("UPDATE ingestion_global_leases SET lease_until_ms=? WHERE job_key=?")
   .run(t-1,root);
  const next=await claimGlobalArchiveLease(dbB,root,ownerB,180_000,t+1);
  assert.ok(next);
  await assert.rejects(stageImmutableEvidenceReferenceTerms(dbA,lease,doc,
    evidence("e-stale","rev-a")),/IMMUTABLE_REFERENCE_TERM_STAGING_DENIED/);
  assert.equal((await searchPublishedImmutableEvidence(dbA,idents,["5.4.7.3"],60)).length,1,
    "new owner without published manifest must preserve old complete exact evidence");
  assert.ok(await stageImmutableExactEvidence(dbB,next,doc,evidence("e-b","rev-b")));
  assert.ok((await stageImmutableEvidenceReferenceTerms(dbB,next,doc,evidence("e-b","rev-b")))>0);
  await stageImmutableVectorPair(dbB,next,doc,"raw",vec("raw","r-b","rev-b"),[idx0,idx1]);
  await stageImmutableVectorPair(dbB,next,doc,"map",vec("map","m-b","rev-b"),[idx0,idx1]);
  assert.equal(await publishImmutableThreeLayerGeneration(dbB,next,doc,{
    rawIds:["r-b"],evidenceIds:["e-b"],mapIds:["m-b"],sourceFingerprint:"rev-b",
  }),true);
  const newRows=await searchPublishedImmutableEvidence(dbA,idents,["5.4.7.3"],60);
  assert.deepEqual(newRows.map(x=>x.id),["e-b"],
    "old Evidence generation must disappear after successful new generation publication");
  console.log("PASS: archive-agnostic identifiers and exact clauses discover ONLY D1-published Evidence; stale and unpublished source pages hidden");
}finally{
 a.close();b.close();rmSync(temp,{recursive:true,force:true});
}
