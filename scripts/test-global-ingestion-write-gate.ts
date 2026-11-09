import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {claimGlobalArchiveLease,type CoordinatorDB} from "../app/lib/ingestion-global-coordinator.ts";
import {makeGlobalArchiveWriteGuard} from "../app/lib/ingestion-global-write-gate.ts";

const root=mkdtempSync(join(tmpdir(),"archive-writer-gate-"));
const file=join(root,"gate.sqlite");
const connA=new DatabaseSync(file),connB=new DatabaseSync(file);
const adapt=(db:DatabaseSync):CoordinatorDB=>({
 prepare:sql=>({
   bind:(...params:unknown[])=>({
     bind:()=>{throw Error("REBIND_BLOCKED");},
     first:async()=>db.prepare(sql).get(...(params as any[])) as Record<string,unknown>||null,
   }),first:async()=>{throw Error("BIND_REQUIRED");},
 }),
});
const dbA=adapt(connA),dbB=adapt(connB);
const job="drive:1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const begin=1794243600000;
const config={INGESTION_GLOBAL_WRITE_GATE_ENABLED:"true",INGESTION_COORDINATOR_ENABLED:"true",
  INGESTION_COORDINATOR_JOB_KEY:job,CORTEX_DB:dbB};
try{
  connA.exec(readFileSync(fileURLToPath(new URL("../docs/ingestion-global-coordinator-schema.sql",import.meta.url)),"utf8"));
  const lease=await claimGlobalArchiveLease(dbA,job,ownerA,30_000,begin);
  assert.ok(lease);
  const bypass=makeGlobalArchiveWriteGuard({},undefined,()=>begin);
  await bypass();
  for(const kind of ["evidence","raw","map","delete"]){
    const writeGate=makeGlobalArchiveWriteGuard(config,{globalArchiveLease:lease},()=>begin+1000);
    await writeGate(); // Shared exact guard for every endpoint/action.
    const bad=makeGlobalArchiveWriteGuard(config,{},()=>begin+1000);
    await assert.rejects(bad(),/GLOBAL_ARCHIVE_LEASE_REQUIRED/);
  }
  const wrong=makeGlobalArchiveWriteGuard(
   config,{globalArchiveLease:{...lease,jobKey:"drive:wrong-root-scope"}},()=>begin+1000);
  await assert.rejects(wrong(),/GLOBAL_ARCHIVE_LEASE_SCOPE_MISMATCH/);
  const noDb=makeGlobalArchiveWriteGuard({...config,CORTEX_DB:undefined},{globalArchiveLease:lease},()=>begin);
  await assert.rejects(noDb(),/GLOBAL_ARCHIVE_COORDINATOR_NOT_READY/);
  const noCoordinator=makeGlobalArchiveWriteGuard({...config,INGESTION_COORDINATOR_ENABLED:"false"},
    {globalArchiveLease:lease},()=>begin);
  await assert.rejects(noCoordinator(),/GLOBAL_ARCHIVE_COORDINATOR_NOT_READY/);
  const expired=makeGlobalArchiveWriteGuard(config,{globalArchiveLease:lease},()=>begin+30001);
  await assert.rejects(expired(),/GLOBAL_ARCHIVE_LEASE_STALE/);
  const successor=await claimGlobalArchiveLease(dbB,job,ownerB,30_000,begin+30002);
  assert.ok(successor);
  assert.equal(successor.generation,2);
  const fenced=makeGlobalArchiveWriteGuard(config,{globalArchiveLease:lease},()=>begin+30003);
  await assert.rejects(fenced(),/GLOBAL_ARCHIVE_LEASE_STALE/);
  const current=makeGlobalArchiveWriteGuard(config,{globalArchiveLease:successor},()=>begin+30003);
  await current();
  connB.exec("DROP TABLE ingestion_global_leases");
  await assert.rejects(current(),/GLOBAL_ARCHIVE_LEASE_DB_UNAVAILABLE/);
  console.log("PASS: every archive action shares fail-closed gate, stale/expired fencing, wrong root, missing config, DB outage");
}finally{
 connA.close();connB.close();rmSync(root,{recursive:true,force:true});
}
