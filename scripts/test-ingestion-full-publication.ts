import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {recordStagedBatch} from "../app/lib/ingestion-generation-publication.ts";
import {stageExactEvidence,recordStagedMap,publishFullGeneration} from "../app/lib/ingestion-full-publication.ts";
import {readFileSync} from "node:fs";
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL);
CREATE TABLE ingestion_document_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL);
CREATE TABLE ingestion_staged_receipts(document_id TEXT NOT NULL,generation INTEGER NOT NULL,chunk_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,source_fingerprint TEXT NOT NULL,PRIMARY KEY(document_id,generation,chunk_id));
INSERT INTO ingestion_worker_leases VALUES('doc','worker-a',1,4102444800000);
INSERT INTO ingestion_document_publications VALUES('doc','doc',0,0);`);
sqlite.exec(readFileSync("docs/ingestion-full-publication-schema.sql","utf8"));
const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({
 run:async()=>({meta:{changes:sqlite.prepare(sql).run(...(args as [])).changes},success:true}),
 first:async()=>sqlite.prepare(sql).get(...(args as [])),
 all:async()=>({results:sqlite.prepare(sql).all(...(args as []))})
})})};
const a={jobKey:"doc",owner:"worker-a",generation:1};
const evidence=(id:string)=>({id,text:"EN 81-20 clause 5 QA",sourceFileId:"doc",fileName:"sample.pdf",sourcePath:"qa/sample.pdf",page:1,chunkIndex:0,sourceFingerprint:"revision-one",identifiersJson:'[{"key":"en8120","label":"EN 81-20"}]',clausesJson:'["5"]'});
await recordStagedBatch(db,a,"doc",["r1","r2"],"revision-one");
for(const malformed of [
 {...evidence("e-bad"),id:" "},
 {...evidence("e-bad"),id:"x".repeat(513)},
 {...evidence("e-bad"),sourceFingerprint:" "},
 {...evidence("e-bad"),sourceFingerprint:"x".repeat(513)},
 {...evidence("e-bad"),page:0},
 {...evidence("e-bad"),page:-1},
 {...evidence("e-bad"),page:1.5},
 {...evidence("e-bad"),chunkIndex:-1},
 {...evidence("e-bad"),chunkIndex:Number.MAX_SAFE_INTEGER+1},
 ]){
 await assert.rejects(stageExactEvidence(db,a,malformed),
   /INVALID_STAGED_EVIDENCE_METADATA/,
   "invalid staged evidence metadata must fail before D1 writes");
}
await assert.rejects(stageExactEvidence(db,a,{...evidence("e-bad"),sourceFileId:"other"}),
 /STAGED_EVIDENCE_IDENTITY_MISMATCH/);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_evidence").get()?.n,
 0,"rejected evidence metadata must not leave partial staging rows");
await stageExactEvidence(db,a,evidence("e1"));
await assert.rejects(
 publishFullGeneration(db,a,"revision-one",["r1","r2"],["e1"],[]),
 /INVALID_FULL_PUBLICATION_MANIFEST/,
 "complete RAW/Evidence/Map publication must reject an empty Map manifest"
);
assert.equal(sqlite.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,
 0,"invalid empty Map must not activate a generation");
assert.equal(await publishFullGeneration(db,a,"revision-one",["r1","r2"],["e1"],["m1"]),false,"map missing");
for(const malformed of [[""],["   "],["x".repeat(513)],[null],[42],["m1",""]]){
 await assert.rejects(
   recordStagedMap(db,a,"doc",malformed as unknown as string[],"revision-one"),
   /INVALID_STAGED_MAP/,"malformed map IDs must fail before D1 writes"
 );
}
assert.equal(
 sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_map_receipts").get()?.n,
 0,"rejected map manifests must not leave partial staging rows"
);
await recordStagedMap(db,a,"doc",["m1"],"revision-one");
assert.equal(await publishFullGeneration(db,a,"wrong",["r1","r2"],["e1"],["m1"]),false,"wrong fingerprint");
assert.equal(await publishFullGeneration(db,a,"revision-one",["r1","wrong"],["e1"],["m1"]),false,"wrong raw manifest");
await assert.rejects(stageExactEvidence(db,a,{...evidence("e1"),text:"mutated"}),/IMMUTABILITY/);
assert.equal(await publishFullGeneration(db,a,"revision-one",["r1","r2"],["e1"],["m1"]),true,"complete generation");
assert.equal(sqlite.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,1);
sqlite.exec("UPDATE ingestion_worker_leases SET owner='worker-b',generation=2 WHERE job_key='doc'");
assert.equal(await publishFullGeneration(db,a,"revision-one",["r1","r2"],["e1"],["m1"]),false,"stale cannot republish");
sqlite.close();
console.log("PASS: three-layer immutable publication requires exact RAW Evidence Map manifests");
