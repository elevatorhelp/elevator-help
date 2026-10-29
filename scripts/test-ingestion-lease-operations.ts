import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {claimIngestionLease,renewIngestionLease} from "../app/lib/ingestion-lease-operations.ts";
const raw=new DatabaseSync(":memory:");
raw.exec("CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY, owner TEXT NOT NULL, generation INTEGER NOT NULL, lease_until_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL)");
const db={prepare:(sql:string)=>({all:async()=>({results:raw.prepare(sql).all()}),bind:(...args:unknown[])=>({run:async()=>({meta:{changes:raw.prepare(sql).run(...(args as [])).changes}}),first:async()=>raw.prepare(sql).get(...(args as []))})})};
const a=await claimIngestionLease(db,"doc","worker-a",180000,1000);
assert.equal(a?.generation,1);
assert.equal(await claimIngestionLease(db,"doc","worker-b",180000,1001),null);
// Reproduced old behavior: renewing a 180s lease with 30s at t=1500
// moved expiry from 181000 to 31500, allowing an early takeover.
assert.equal(await renewIngestionLease(db,a,30000,1500),true);
assert.equal(raw.prepare("SELECT lease_until_ms FROM ingestion_worker_leases WHERE job_key=?").get("doc")?.lease_until_ms,181000,
  "A shorter renewal must preserve the existing expiry");
assert.equal(await claimIngestionLease(db,"doc","worker-b",180000,32000),null,
  "No premature takeover after a shorter renewal");
assert.equal(await renewIngestionLease(db,a,180000,2000),true);
const b=await claimIngestionLease(db,"doc","worker-b",180000,182001);
assert.equal(b?.generation,2);
assert.equal(await renewIngestionLease(db,a,180000,182002),false);
assert.equal(await renewIngestionLease(db,b,180000,182002),true);
// Old D1 schemas without updated_at_ms must obey the same monotonic rule.
const legacy=new DatabaseSync(":memory:");
legacy.exec("CREATE TABLE ingestion_worker_leases(job_key TEXT PRIMARY KEY, owner TEXT NOT NULL, generation INTEGER NOT NULL, lease_until_ms INTEGER NOT NULL)");
const legacyDb={prepare:(sql:string)=>({all:async()=>({results:legacy.prepare(sql).all()}),bind:(...args:unknown[])=>({run:async()=>({meta:{changes:legacy.prepare(sql).run(...(args as [])).changes}}),first:async()=>legacy.prepare(sql).get(...(args as []))})})};
const oldLease=await claimIngestionLease(legacyDb,"legacy-doc","owner-a",180000,1000);
assert.equal(oldLease?.generation,1);
assert.equal(await renewIngestionLease(legacyDb,oldLease,30000,1500),true);
assert.equal(legacy.prepare("SELECT lease_until_ms FROM ingestion_worker_leases WHERE job_key=?").get("legacy-doc")?.lease_until_ms,181000,
  "Legacy schema must not shorten an active lease");
assert.equal(await claimIngestionLease(legacyDb,"legacy-doc","owner-b",180000,32000),null);
assert.equal(await renewIngestionLease(legacyDb,oldLease,180000,2000),true);
assert.equal(legacy.prepare("SELECT lease_until_ms FROM ingestion_worker_leases WHERE job_key=?").get("legacy-doc")?.lease_until_ms,182000);
console.log("PASS: atomic claim, monotonic renewal, expiration, takeover, stale fencing");
