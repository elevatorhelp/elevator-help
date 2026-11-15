/**
 * Issue #106: first OFFLINE gate. Two independent lease namespaces in the
 * SAME isolated D1 must own separate document IDs and checkpoints.
 * This test does not launch/authorize two paid ingestion Workers.
 */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {
 claimGlobalArchiveLease,releaseGlobalArchiveLease,
 readDurableArchiveCheckpoint,writeDurableArchiveCheckpoint,
 type CoordinatorDB
} from "../app/lib/ingestion-global-coordinator.ts";
import {claimDocumentStagingEpoch} from "../app/lib/ingestion-document-staging-epoch.ts";
// @ts-expect-error existing JavaScript shard helper has no TypeScript declarations
import {shardForDocumentId} from "./archive-sharding.mjs";
const root="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const jobA="drive:"+root+"_qa_shard0";
const jobB="drive:"+root+"_qa_shard1";
const ownerA="gh-42678073650-aaaaaaaaaaaaaaaa";
const ownerB="gh-42678073651-bbbbbbbbbbbbbbbb";
const ownerC="gh-42678073652-cccccccccccccccc";
const ids=Array.from({length:80},(_,i)=>"QA_Synthetic_Document_"+i);
const docA=ids.find(id=>shardForDocumentId(id,2)===0);
const docB=ids.find(id=>shardForDocumentId(id,2)===1);
assert.ok(docA&&docB&&docA!==docB);
const temp=mkdtempSync(join(tmpdir(),"qa-two-owner-"));
const sqlite=new DatabaseSync(join(temp,"two-owner.sqlite"));
const db:CoordinatorDB={prepare:sql=>({
 bind:(...values:unknown[])=>({
  first:async()=>sqlite.prepare(sql).get(...(values as any[])) as Record<string,unknown>|null??null,
  bind:()=>{throw Error("NO_DOUBLE_BIND");}
 }),
 first:async()=>{throw Error("BIND_REQUIRED");}
})};
for(const file of [
 "../docs/ingestion-global-coordinator-schema.sql",
 "../docs/ingestion-v2-document-epoch-schema.sql"
])sqlite.exec(readFileSync(fileURLToPath(new URL(file,import.meta.url)),"utf8"));
const state=(index:number,documentId:string)=>({
 version:3,qaShard:{index,count:2,rootId:root},
 scopes:{[root]:{files:{[documentId]:{}},v2Files:{}}}
});
function checkedShardSnapshot(snapshot:{state:Record<string,unknown>}|null){
 assert.ok(snapshot,"D1 checkpoint required");
 const shard=snapshot.state.qaShard;
 assert.ok(shard && typeof shard==="object" && !Array.isArray(shard)
   && "index" in shard && typeof shard.index==="number",
   "checkpoint must contain a valid shard index");
 const scopes=snapshot.state.scopes;
 assert.ok(scopes && typeof scopes==="object" && !Array.isArray(scopes));
 const scope=(scopes as Record<string,unknown>)[root];
 assert.ok(scope && typeof scope==="object" && !Array.isArray(scope));
 const files=(scope as Record<string,unknown>).files;
 assert.ok(files && typeof files==="object" && !Array.isArray(files));
 return {index:shard.index,fileIds:Object.keys(files)};
}
try{
 const [a,b]=await Promise.all([
  claimGlobalArchiveLease(db,jobA,ownerA),
  claimGlobalArchiveLease(db,jobB,ownerB),
 ]);
 assert.ok(a&&b&&a.jobKey!==b.jobKey,"two independent leases active in same D1");
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_global_leases WHERE lease_until_ms > ?").get(Date.now())?.n,2);
 const [ca,cb]=await Promise.all([
  writeDurableArchiveCheckpoint(db,a,0,state(0,docA!)),
  writeDurableArchiveCheckpoint(db,b,0,state(1,docB!)),
 ]);
 assert.equal(ca?.version,1);assert.equal(cb?.version,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_worker_checkpoints").get()?.n,2);
 const [epochA,epochB]=await Promise.all([
  claimDocumentStagingEpoch(db,a,docA!,"a".repeat(64)),
  claimDocumentStagingEpoch(db,b,docB!,"b".repeat(64))
 ]);
 assert.equal(epochA,1);assert.equal(epochB,1);
 assert.equal(await claimDocumentStagingEpoch(db,b,docA!,"b".repeat(64)),null,
   "wrong shard cannot claim already owned document");
 assert.equal(await claimDocumentStagingEpoch(db,a,docB!,"a".repeat(64)),null,
   "another shard's document is not rewritable");
 const snapshots=await Promise.all([
  readDurableArchiveCheckpoint(db,a),
  readDurableArchiveCheckpoint(db,b)
 ]);
 const shardA=checkedShardSnapshot(snapshots[0]);
 const shardB=checkedShardSnapshot(snapshots[1]);
 assert.equal(shardA.index,0);
 assert.equal(shardB.index,1);
 assert.deepEqual(shardA.fileIds,[docA]);
 assert.deepEqual(shardB.fileIds,[docB]);
 assert.equal(await releaseGlobalArchiveLease(db,a),true);
 const a2=await claimGlobalArchiveLease(db,jobA,ownerC);
 assert.ok(a2&&a2.generation>a.generation);
 assert.equal(await writeDurableArchiveCheckpoint(db,a,1,state(0,docA!)),null,
   "stale owner cannot commit checkpoint after takeover");
 assert.equal(await claimDocumentStagingEpoch(db,a,docA!,"c".repeat(64)),null,
   "stale owner cannot alter document revision");
 const recovery=await readDurableArchiveCheckpoint(db,a2);
 assert.equal(recovery?.version,1);
 assert.equal(checkedShardSnapshot(recovery).index,0);
 assert.equal(await claimDocumentStagingEpoch(db,a2,docA!,"a".repeat(64)),1,
   "same document revision survives owner rotation");
 assert.equal(await claimDocumentStagingEpoch(db,a2,docA!,"c".repeat(64)),2,
   "replaced document revision is epoch-fenced and monotonic");
 const stillB=await readDurableArchiveCheckpoint(db,b);
 assert.equal(stillB?.version,1);
 assert.equal(checkedShardSnapshot(stillB).index,1,
   "second worker checkpoint unaffected by first worker takeover");
 assert.equal(await claimDocumentStagingEpoch(db,b,docB!,"b".repeat(64)),1,
   "second worker continues its original document epoch");
 console.log("PASS: two simultaneously held D1 leases with distinct document claims, independent checkpoints, owner failover, stale-owner denial and unaffected second worker");
 console.log("QA106_D1_TWO_OWNER_OFFLINE_PASS_NO_PRODUCTION");
}finally{
 sqlite.close();rmSync(temp,{recursive:true,force:true});
}
