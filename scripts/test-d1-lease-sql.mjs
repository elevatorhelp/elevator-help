import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// Offline SQLite model of the D1 SQL contract; no cloud resources touched.
test("lease ownership, expiry, fencing and renewal",()=>{
 const db=new DatabaseSync(":memory:");
 try {
  db.exec("CREATE TABLE leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 1,lease_until_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL)");
  const claim=db.prepare(`INSERT INTO leases(job_key,owner,generation,lease_until_ms,updated_at_ms)
 VALUES(?,?,1,?+?,?) ON CONFLICT(job_key) DO UPDATE SET
 owner=excluded.owner,generation=leases.generation+1,
 lease_until_ms=excluded.lease_until_ms,updated_at_ms=excluded.updated_at_ms
 WHERE leases.lease_until_ms<=?`);
  const acquire=(owner,now,ttl)=>claim.run("doc:v1:raw",owner,now,ttl,now,now).changes;
  assert.equal(acquire("A",100,20),1);
  assert.equal(acquire("B",110,20),0);
  assert.equal(acquire("B",120,20),1);
  const current=db.prepare("SELECT owner,generation FROM leases").get();
  assert.equal(current.owner,"B");
  assert.equal(current.generation,2);
  const renew=db.prepare("UPDATE leases SET lease_until_ms=?,updated_at_ms=? WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?");
  assert.equal(renew.run(150,121,"doc:v1:raw","A",1,121).changes,0);
  assert.equal(renew.run(150,121,"doc:v1:raw","B",2,121).changes,1);
 } finally {db.close();}
});
