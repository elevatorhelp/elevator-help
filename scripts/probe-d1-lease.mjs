import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const db=process.env.TEST_DB||"";
if(!/^elevator-help-lease-test-[a-zA-Z0-9_-]+$/.test(db)) throw Error("ISOLATED_D1_DATABASE_REQUIRED");
const id="lease-probe-"+process.env.GITHUB_RUN_ID;
const now=Date.now();
function query(sql){
 const raw=execFileSync("npx",["--yes","wrangler@4.125.0","d1","execute",db,"--remote","--json","--command",sql],{encoding:"utf8",timeout:120000});
 const first=raw.indexOf("[");if(first<0)throw Error("D1_JSON_RESPONSE_MISSING");
 const result=JSON.parse(raw.slice(first));
 if(!Array.isArray(result)||result[0]?.success!==true)throw Error("D1_EXECUTION_FAILED");
 return result[0];
}
const sql=(owner,ts)=>`INSERT INTO ingestion_worker_leases(job_key,owner,generation,lease_until_ms,updated_at_ms)
VALUES('${id}','${owner}',1,${ts+20000},${ts})
ON CONFLICT(job_key) DO UPDATE SET owner=excluded.owner,generation=ingestion_worker_leases.generation+1,lease_until_ms=excluded.lease_until_ms,updated_at_ms=excluded.updated_at_ms
WHERE ingestion_worker_leases.lease_until_ms<=${ts}`;
query("CREATE TABLE IF NOT EXISTS ingestion_worker_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 1,lease_until_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL)");
try{
 query(sql("A",now));
 query(sql("B",now+1));
 let row=query(`SELECT owner,generation FROM ingestion_worker_leases WHERE job_key='${id}'`).results[0];
 assert.equal(row.owner,"A");assert.equal(row.generation,1);
 query(sql("B",now+20000));
 row=query(`SELECT owner,generation FROM ingestion_worker_leases WHERE job_key='${id}'`).results[0];
 assert.equal(row.owner,"B");assert.equal(row.generation,2);
 query(`UPDATE ingestion_worker_leases SET lease_until_ms=${now+50000} WHERE job_key='${id}' AND owner='A' AND generation=1 AND lease_until_ms>${now+20001}`);
 row=query(`SELECT owner,generation,lease_until_ms FROM ingestion_worker_leases WHERE job_key='${id}'`).results[0];
 assert.equal(row.owner,"B");assert.equal(row.generation,2);assert.equal(row.lease_until_ms,now+40000);
 console.log("D1 isolated lease ownership, expiry, fencing: PASS");
}finally{query(`DELETE FROM ingestion_worker_leases WHERE job_key='${id}'`)}
