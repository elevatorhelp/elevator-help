import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {
  claimGlobalArchiveLease,renewGlobalArchiveLease,releaseGlobalArchiveLease,
  readDurableArchiveCheckpoint,writeDurableArchiveCheckpoint,
  type CoordinatorDB,
} from "../app/lib/ingestion-global-coordinator.ts";

const root=mkdtempSync(join(tmpdir(),"archive-coord-sqlite-"));
const file=join(root,"qa.sqlite");
const a=new DatabaseSync(file);
const b=new DatabaseSync(file);
const schema=readFileSync(fileURLToPath(new URL("../docs/ingestion-global-coordinator-schema.sql",import.meta.url)),"utf8");
const adapter=(db:DatabaseSync):CoordinatorDB=>({
  prepare:(sql:string)=>({
    bind:(...params:unknown[])=>({
      bind:()=>{throw Error("DOUBLE_BIND_DISALLOWED");},
      first:async()=>db.prepare(sql).get(...(params as any[])) as Record<string,unknown>|null ?? null,
    }),
    first:async()=>{throw Error("BIND_REQUIRED");},
  }),
});
const dbA=adapter(a),dbB=adapter(b);
const job="drive:1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const t=1794243600000;
const state={version:3,scopes:{folder:{files:{
  "fictional-document-A":{evidenceNextChunk:4,rawNextChunk:7,partialRawIds:["v1"]},
  "fictional-document-B":{mapNextPage:13},
},lastSelectedPhase:"raw"}}};
try {
  a.exec(schema);
  const [leaseA,loser]=await Promise.all([
    claimGlobalArchiveLease(dbA,job,ownerA,60_000,t),
    claimGlobalArchiveLease(dbB,job,ownerB,60_000,t),
  ]);
  assert.ok(leaseA);assert.equal(loser,null,"only one process may own whole archive");
  assert.equal(leaseA.generation,1);
  assert.equal(await readDurableArchiveCheckpoint(dbA,leaseA,t+1),null);
  assert.equal(await writeDurableArchiveCheckpoint(dbA,leaseA,0,state,t+1)?.then(x=>x?.version),1);
  const read1=await readDurableArchiveCheckpoint(dbA,leaseA,t+2);
  assert.equal(read1?.version,1);
  assert.deepEqual(read1?.state,state,"source progress and partial checkpoints preserved");
  assert.equal(read1?.checksum.length,64);
  assert.equal(await writeDurableArchiveCheckpoint(dbA,leaseA,0,state,t+3),null,"stale version compare-and-swap denied");
  assert.equal(await renewGlobalArchiveLease(dbA,leaseA,30_000,t+20_000),true);
  assert.equal(await claimGlobalArchiveLease(dbB,job,ownerB,60_000,t+50_000),null,"lease renewal prevents stealing");
  assert.equal(await renewGlobalArchiveLease(dbA,leaseA,60_000,t+30_000),true);
  assert.equal(await claimGlobalArchiveLease(dbB,job,ownerB,60_000,t+80_000),null);
  const leaseB=await claimGlobalArchiveLease(dbB,job,ownerB,60_000,t+91_000);
  assert.ok(leaseB);assert.equal(leaseB.generation,2,"monotonic fencing generation");
  assert.equal(await writeDurableArchiveCheckpoint(dbA,leaseA,1,state,t+91_001),null,"stale prior worker fenced at same atomic SQL");
  assert.equal(await renewGlobalArchiveLease(dbA,leaseA,60_000,t+91_001),false);
  assert.equal(await releaseGlobalArchiveLease(dbA,leaseA,t+91_001),false);
  const loadedB=await readDurableArchiveCheckpoint(dbB,leaseB,t+91_002);
  assert.deepEqual(loadedB?.state,state,"new owner recovers prior published checkpoint");
  const next={...state,scopes:{folder:{...state.scopes.folder,files:{
    ...state.scopes.folder.files,
    "fictional-document-C":{evidenceNextChunk:1},
  }}}};
  const saved=await writeDurableArchiveCheckpoint(dbB,leaseB,1,next,t+91_003);
  assert.equal(saved?.version,2);
  assert.equal(await writeDurableArchiveCheckpoint(dbB,leaseB,1,next,t+91_004),null);
  assert.equal(await releaseGlobalArchiveLease(dbB,leaseB,t+91_005),true);
  assert.equal(await writeDurableArchiveCheckpoint(dbB,leaseB,2,next,t+91_006),null);
  const reclaimer=await claimGlobalArchiveLease(dbA,job,ownerA,60_000,t+91_007);
  assert.equal(reclaimer?.generation,3);
  assert.equal((await readDurableArchiveCheckpoint(dbA,reclaimer!,t+91_008))?.version,2);
  b.prepare("UPDATE ingestion_worker_checkpoints SET state_json=? WHERE job_key=?")
   .run('{"version":3,"scopes":{"tampered":{}}}',job);
  await assert.rejects(readDurableArchiveCheckpoint(dbA,reclaimer!,t+91_009),/DURABLE_CHECKPOINT_INTEGRITY_FAILURE/);
  await assert.rejects(claimGlobalArchiveLease(dbA,job,"bad-owner",60_000,t),/INVALID_GLOBAL_ARCHIVE_LEASE/);
  await assert.rejects(writeDurableArchiveCheckpoint(dbA,reclaimer!,2,{version:3,scopes:{}},t+91_009),/INVALID_DURABLE_CHECKPOINT_STATE/);
  console.log("PASS: two SQLite connections, global exclusive lock, generation fencing, renew/expiry, CAS, durable resume, tamper rejection");
}finally {
  a.close();b.close();
  rmSync(root,{recursive:true,force:true});
}
