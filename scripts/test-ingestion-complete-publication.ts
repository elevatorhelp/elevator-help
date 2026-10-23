import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {recordStagedBatch,publishCompleteStagedGeneration} from "../app/lib/ingestion-generation-publication.ts";
const db0=new DatabaseSync(":memory:");
db0.exec(`CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL);
CREATE TABLE ingestion_document_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL);
CREATE TABLE ingestion_staged_receipts(document_id TEXT NOT NULL,generation INTEGER NOT NULL,chunk_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(document_id,generation,chunk_id));
INSERT INTO ingestion_worker_leases VALUES('doc','A',1,4102444800000);
INSERT INTO ingestion_document_publications VALUES('doc','doc',0,0);`);
const db={prepare:(sql:string)=>({bind:(...params:unknown[])=>({
 first:async()=>db0.prepare(sql).get(...(params as [])),
 run:async()=>{const r=db0.prepare(sql).run(...(params as []));return {success:true,meta:{changes:r.changes}}}
})})};
const a={jobKey:"doc",owner:"A",generation:1};
await recordStagedBatch(db,a,"doc",["c1","c2"]);
assert.equal(await publishCompleteStagedGeneration(db,a,"doc",3),false,"partial batch must not publish");
await recordStagedBatch(db,a,"doc",["c2","c3"]);
assert.equal(await publishCompleteStagedGeneration(db,a,"doc",3),true);
assert.equal(db0.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,1);
db0.exec("UPDATE ingestion_worker_leases SET owner='B',generation=2 WHERE job_key='doc'");
assert.equal(await publishCompleteStagedGeneration(db,a,"doc",3),false);
const b={jobKey:"doc",owner:"B",generation:2};
await recordStagedBatch(db,b,"doc",["c1"]);
assert.equal(await publishCompleteStagedGeneration(db,b,"doc",3),false);
assert.equal(db0.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,1);
await recordStagedBatch(db,b,"doc",["c2","c3"]);
db0.exec("UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key='doc'");
assert.equal(await publishCompleteStagedGeneration(db,b,"doc",3),false);
db0.exec("UPDATE ingestion_worker_leases SET lease_until_ms=4102444800000 WHERE job_key='doc'");
assert.equal(await publishCompleteStagedGeneration(db,b,"doc",3),true);
assert.equal(db0.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,2);
console.log("PASS: incomplete, duplicate, takeover, expiry, resume and atomic complete publish");
