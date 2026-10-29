import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {publishExactStagedManifest,recordStagedBatch,stagedVectorId} from "../app/lib/ingestion-generation-publication.ts";
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL);
CREATE TABLE ingestion_document_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL DEFAULT 0,updated_at_ms INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ingestion_staged_receipts(document_id TEXT NOT NULL,generation INTEGER NOT NULL,chunk_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,source_fingerprint TEXT NOT NULL,PRIMARY KEY(document_id,generation,chunk_id));
INSERT INTO ingestion_worker_leases VALUES('doc-1','A',1,4102444800000);
INSERT INTO ingestion_document_publications VALUES('doc-1','doc-1',0,0);`);
const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({
 first:async()=>sqlite.prepare(sql).get(...(args as [])),
 run:async()=>({meta:{changes:sqlite.prepare(sql).run(...(args as [])).changes}})
})})};
const a={jobKey:"doc-1",owner:"A",generation:1};
// A valid lease for one document must not write receipts under another document.
await assert.rejects(
  recordStagedBatch(db,a,"other-doc",["foreign-chunk"],"version-1"),
  /LEASE_DOCUMENT_MISMATCH/,
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_receipts").get()?.n,0);
for(const badId of ["", "x".repeat(513)]){
  await assert.rejects(
    recordStagedBatch(db,a,"doc-1",[badId],"version-1"),
    /INVALID_STAGED_BATCH/,
  );
}
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_receipts").get()?.n,0);
assert.equal(stagedVectorId("chunk",1),"g1:chunk");
await recordStagedBatch(db,a,"doc-1",["chunk"],"version-1");
assert.equal(await publishExactStagedManifest(db,a,"doc-1","version-1",["chunk"]),true);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,1);
assert.equal(await publishExactStagedManifest(db,a,"doc-1","version-1",["chunk"]),false,
  "repeated publication of an already active generation must not rewrite D1");
// Simulate worker A crashing after writing immutable staging IDs. B takes over.
sqlite.exec("UPDATE ingestion_worker_leases SET owner='B',generation=2 WHERE job_key='doc-1'");
assert.equal(await publishExactStagedManifest(db,a,"doc-1","version-1",["chunk"]).catch(()=>false),false);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,1);
const b={jobKey:"doc-1",owner:"B",generation:2};
await recordStagedBatch(db,b,"doc-1",["chunk"],"version-2");
assert.equal(await publishExactStagedManifest(db,b,"doc-1","version-2",["chunk"]),true);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,2);
// Simulate inconsistent restored lease metadata: even a valid old-generation
// lease must never move the active document generation backwards.
sqlite.exec("UPDATE ingestion_worker_leases SET owner='A',generation=1 WHERE job_key='doc-1'");
assert.equal(await publishExactStagedManifest(db,a,"doc-1","version-1",["chunk"]),false,
  "valid lower-generation lease must not downgrade an already newer publication");
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,2);
sqlite.exec("UPDATE ingestion_worker_leases SET owner='B',generation=2 WHERE job_key='doc-1'");
// Crash / expiry before commit: no publish.
sqlite.exec("UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key='doc-1'");
assert.equal(await publishExactStagedManifest(db,b,"doc-1","version-2",["chunk"]).catch(()=>false),false);
assert.equal(sqlite.prepare("SELECT active_generation FROM ingestion_document_publications").get()?.active_generation,2);
console.log("D1 CAS staged publication: stale worker rejected, crash/expiry preserves published generation");
