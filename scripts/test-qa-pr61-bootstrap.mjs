import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

const db=new DatabaseSync(":memory:");
try{
  const sql=readFileSync(new URL("./qa-pr61-bootstrap.sql",import.meta.url),"utf8");
  db.exec(sql);
  db.exec(sql); // Bootstrap must be idempotent.
  const cols=db.prepare("PRAGMA table_info(ingestion_worker_leases)").all().map(x=>x.name);
  for(const col of ["job_key","owner","generation","lease_until_ms","updated_at_ms"])
    assert.ok(cols.includes(col),"QA lease missing "+col);
  const now=Date.now();
  db.prepare("INSERT INTO ingestion_worker_leases(job_key,owner,generation,lease_until_ms,updated_at_ms) VALUES(?,?,?,?,?)")
    .run("qa-schema-test","qa-owner",1,now+420000,now);
  assert.equal(db.prepare("SELECT generation FROM ingestion_worker_leases WHERE job_key=?").get("qa-schema-test").generation,1);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  console.log("PASS: isolated QA bootstrap schema matches actual app E2E insert and is idempotent");
}finally{db.close();}
