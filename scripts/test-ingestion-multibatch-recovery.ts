import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {claimIngestionLease,renewIngestionLease} from "../app/lib/ingestion-lease-operations.ts";
import {recordStagedBatch,publishExactStagedManifest} from "../app/lib/ingestion-generation-publication.ts";

// Deterministic durable-restart contract: two batches, lost owner, replay and
// renewed successor. This is SQLite protocol QA, NOT real Drive/Worker E2E.
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL);
CREATE TABLE ingestion_document_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL);
CREATE TABLE ingestion_staged_receipts(document_id TEXT NOT NULL,generation INTEGER NOT NULL,chunk_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,source_fingerprint TEXT NOT NULL,PRIMARY KEY(document_id,generation,chunk_id));
INSERT INTO ingestion_document_publications VALUES('doc','doc',0,0);`);
const db={prepare:(sql:string)=>({
 all:async()=>({results:sqlite.prepare(sql).all()}),
 bind:(...args:unknown[])=>({
  run:async()=>{const v=sqlite.prepare(sql).run(...(args as []));return {success:true,meta:{changes:v.changes}};},
  first:async()=>sqlite.prepare(sql).get(...(args as [])),
  all:async()=>({results:sqlite.prepare(sql).all(...(args as []))})
 })
})};
const ids=["c1","c2","c3","c4"], fp="multi-page-revision-1";
const now=Date.now();
const a=await claimIngestionLease(db,"doc","owner-A",30000,now);
assert.ok(a);
await recordStagedBatch(db,a,"doc",ids.slice(0,2),fp);
assert.equal(await publishExactStagedManifest(db,a,"doc",fp,ids),false,"must not publish first batch");
assert.equal(await renewIngestionLease(db,a,300000,now+1000),true,"active owner renews");
assert.equal(await claimIngestionLease(db,"doc","owner-B",30000,now+2000),null,"renewed lease prevents takeover");
// Model a process crash, then expire the lease without relying on wall-clock sleeps.
sqlite.prepare("UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key='doc'").run();
const b=await claimIngestionLease(db,"doc","owner-B",300000,Date.now());
assert.ok(b);
assert.equal(b.generation,a.generation+1,"takeover creates fresh generation");
assert.equal(await renewIngestionLease(db,a,30000,Date.now()),false,"stale owner cannot renew");
assert.equal(await publishExactStagedManifest(db,a,"doc",fp,ids),false,"stale owner cannot publish");
assert.equal(sqlite.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,0);
// Durable checkpoint discovery: partial receipts from old generation remain
// quarantined; successor must rebuild its own exact manifest.
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_receipts WHERE generation=1").get()?.n,2);
await recordStagedBatch(db,b,"doc",ids.slice(0,2),fp);
await recordStagedBatch(db,b,"doc",ids.slice(2),fp);
await recordStagedBatch(db,b,"doc",ids.slice(0,2),fp); // idempotent replay
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_staged_receipts WHERE generation=2").get()?.n,4);
assert.equal(await publishExactStagedManifest(db,b,"doc",fp,["c1","c2","c3","wrong"]),false,"exact manifest required");
assert.equal(await renewIngestionLease(db,b,300000,Date.now()),true);
assert.equal(await publishExactStagedManifest(db,b,"doc",fp,ids),true,"complete generation publishes");
assert.equal(sqlite.prepare("SELECT active_generation AS g FROM ingestion_document_publications").get()?.g,2);
sqlite.close();
console.log("PASS: two batches, lease renew, crash takeover, stale fencing, replay and complete atomic publication (offline SQLite)");
