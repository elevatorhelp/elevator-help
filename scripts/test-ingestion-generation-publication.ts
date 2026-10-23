import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {publishStagedGeneration,stagedVectorId} from "../app/lib/ingestion-generation-publication.ts";
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL);
CREATE TABLE ingestion_document_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL DEFAULT 0,updated_at_ms INTEGER NOT NULL DEFAULT 0);
INSERT INTO ingestion_worker_leases VALUES('doc-1','A',1,4102444800000);
INSERT INTO ingestion_document_publications VALUES('doc-1','doc-1',0,0);`);
const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({
 first:async()=>sqlite.prepare(sql).get(...(args as [])),
 run:async()=>({meta:{changes:sqlite.prepare(sql).run(...(args as [])).changes}})
})})};
const a={jobKey:"doc-1",owner:"A",generation:1};
assert.equal(stagedVectorId("chunk",1),"g1:chunk");
assert.equal(await publishStagedGeneration(db,a,"doc-1"),true);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,1);
// Simulate worker A crashing after writing immutable staging IDs. B takes over.
sqlite.exec("UPDATE ingestion_worker_leases SET owner='B',generation=2 WHERE job_key='doc-1'");
assert.equal(await publishStagedGeneration(db,a,"doc-1").catch(()=>false),false);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,1);
const b={jobKey:"doc-1",owner:"B",generation:2};
assert.equal(await publishStagedGeneration(db,b,"doc-1"),true);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,2);
// Crash / expiry before commit: no publish.
sqlite.exec("UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key='doc-1'");
assert.equal(await publishStagedGeneration(db,b,"doc-1").catch(()=>false),false);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,2);
console.log("D1 CAS staged publication: stale worker rejected, crash/expiry preserves published generation");
