/**
 * Issue #106 — purely LOCAL SQLite D1-schema migration + backup/restore drill.
 * Never talks to Cloudflare or Gemini. No production/QA D1 writes.
 *
 * Verify the exact existing A-publication, B pending window, RAW/Evidence and
 * checkpoint rows remain unchanged across additive preview migrations and
 * that a pre-migration SQLite backup restores the old schema without new
 * revision rows, with intact data and foreign keys.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,rmSync,copyFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const lab=mkdtempSync(join(tmpdir(),"qa106-migration-restore-"));
const original=join(lab,"before.sqlite"),backup=join(lab,"safety-backup.sqlite");
const restored=join(lab,"restored.sqlite");
const read=(name:string)=>readFileSync(new URL("../docs/"+name,import.meta.url),"utf8");
const baselineSchemas=[
 "ingestion-global-coordinator-schema.sql",
 "ingestion-v2-document-epoch-schema.sql",
 "ingestion-immutable-publication-schema.sql",
 "ingestion-v2-pending-map-windows-schema.sql",
];
const migrationSchemas=[
 "qa106-map-revision-shadow-schema.sql",
 "qa106-generic-map-revision-preview-schema.sql",
];
const hash=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const sha="a".repeat(64),documentA="QA106-SYNTHETIC-A",documentB="QA106-SYNTHETIC-B";
const jobA="drive:qa106-synthetic-A",jobB="drive:qa106-synthetic-B",at=1700000000000;
const epoch=2;
const oldTables=[
 "ingestion_global_leases","ingestion_worker_checkpoints",
 "ingestion_v2_document_epochs","ingestion_v2_publications",
 "ingestion_v2_vector_receipts","ingestion_v2_staged_evidence",
 "ingestion_v2_pending_map_windows",
];
const allTables=(db:DatabaseSync)=>db.prepare(
 "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all().map(x=>String(x.name));
function state(db:DatabaseSync){
 const tables=allTables(db);
 const records=oldTables.map(name=>{
  assert.ok(tables.includes(name),"missing legacy table "+name);
  return {name,rows:db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()};
 });
 return {tables:tables.filter(x=>oldTables.includes(x)),hash:hash(records),
   data:records};
}
function integrity(db:DatabaseSync){
 assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check,"ok");
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
}
try{
 const db=new DatabaseSync(original);
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of baselineSchemas)db.exec(read(file));
 db.prepare(`INSERT INTO ingestion_v2_document_epochs
 (document_id,job_key,staging_epoch,source_fingerprint,updated_at_ms)
 VALUES (?,?,?,?,?)`).run(documentB,jobB,epoch,sha,at);
 db.prepare(`INSERT INTO ingestion_v2_publications
 (document_id,job_key,active_generation,source_fingerprint,manifest_sha256,
 raw_count,evidence_count,map_count,published_at_ms)
 VALUES (?,?,?,?,?,?,?,?,?)`).run(documentA,jobA,1,sha,"b".repeat(64),2,2,2,at);
 db.prepare(`INSERT INTO ingestion_worker_checkpoints
 (job_key,version,lease_generation,checksum,state_json,updated_at_ms)
 VALUES (?,?,?,?,?,?)`).run(jobB,14,5,"c".repeat(64),
 JSON.stringify({version:3,synthetic:true}),at);
 db.prepare(`INSERT INTO ingestion_v2_pending_map_windows
 (document_id,job_key,generation,source_fingerprint,window_key,
 map_version,ids_json,created_at_ms) VALUES (?,?,?,?,?,?,?,?)`).run(
 documentB,jobB,epoch,sha,"d".repeat(64),4,
 JSON.stringify([{logicalId:"map-old",stagedId:"v2m-old"}]),at);
 for(const [idx,layer] of ["raw","raw","map"].entries()){
  db.prepare(`INSERT INTO ingestion_v2_vector_receipts
   (document_id,generation,layer,logical_id,staged_id,source_fingerprint,
    created_at_ms) VALUES (?,?,?,?,?,?,?)`).run(
   documentB,epoch,layer,layer+"-"+idx,"vector-"+idx,sha,at);
 }
 for(let i=0;i<2;i++){
  db.prepare(`INSERT INTO ingestion_v2_staged_evidence
   (document_id,generation,logical_id,source_fingerprint,text,file_name,
     source_path,page,chunk_index,created_at_ms)
   VALUES (?,?,?,?,?,?,?,?,?,?)`).run(documentB,epoch,"evidence-"+i,
   sha,"synthetic citation only","fixture.pdf","qa/fixture.pdf",i+1,i,at);
 }
 integrity(db);
 const before=state(db);
 // VACUUM INTO is SQLite's consistent file-level backup on this local lab.
 // It is not a claim about Cloudflare remote export/restore.
 db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
 assert.ok(existsSync(backup));
 const safe=new DatabaseSync(backup,{readOnly:true});
 integrity(safe);
 assert.deepEqual(state(safe),before);
 safe.close();
 // Additive, idempotent migration. The legacy table contents and
 // schema definitions must remain byte-for-byte logically equivalent.
 const oldSchema=db.prepare(`SELECT name,type,sql FROM sqlite_master
  WHERE name IN (${oldTables.map(()=>"?").join(",")}) ORDER BY name`)
  .all(...oldTables);
 for(const file of migrationSchemas){db.exec(read(file));db.exec(read(file))}
 integrity(db);
 assert.equal(state(db).hash,before.hash);
 const schemaAfter=db.prepare(`SELECT name,type,sql FROM sqlite_master
  WHERE name IN (${oldTables.map(()=>"?").join(",")}) ORDER BY name`)
  .all(...oldTables);
 assert.deepEqual(schemaAfter,oldSchema,"legacy CREATE TABLE SQL modified");
 const newTables=allTables(db).filter(name=>!before.tables.includes(name));
 assert.deepEqual(newTables,[
  "ingestion_v2_map_revision_activations",
  "ingestion_v2_map_revision_candidates",
  "ingestion_v2_map_revision_receipts",
  "qa106_map_revision_provider_reservations",
  "qa106_map_revision_receipts",
  "qa106_map_revision_shadow_publications",
  "qa106_map_revisions",
 ]);
 // Referential integrity must reject revision receipts with no candidate,
 // not silently make old incomplete B Map look published.
 assert.throws(()=>db.prepare(`INSERT INTO ingestion_v2_map_revision_receipts
  (document_id,staging_epoch,revision,logical_id,staged_id,
   source_fingerprint,created_at_ms) VALUES (?,?,?,?,?,?,?)`)
  .run(documentB,epoch,1,"map-synthetic-new","v2m-new",sha,at),
  /FOREIGN KEY constraint failed/);
 assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ingestion_v2_publications
  WHERE document_id=?`).get(documentB)?.n,0);
 // This test activation contains no customer content. Real data must
 // never be copied into fixture logs.
 db.prepare(`INSERT INTO ingestion_v2_map_revision_candidates
 (document_id,staging_epoch,revision,job_key,source_fingerprint,state,
   payload_json,payload_sha256,embeddings_sha256)
 VALUES (?,?,?,?,?,'embedded',?,?,?)`).run(documentB,epoch,1,jobB,sha,
 JSON.stringify({entries:[]}),"e".repeat(64),"f".repeat(64));
 db.prepare(`INSERT INTO ingestion_v2_map_revision_activations
 (document_id,job_key,staging_epoch,revision,source_fingerprint,state,
 manifest_sha256,raw_count,evidence_count,map_count,activated_at_ms)
 VALUES (?,?,?,?,?,'blocked',?,?,?,?,?)`).run(
 documentB,jobB,epoch,1,sha,"f".repeat(64),2,2,2,at);
 integrity(db);
 assert.equal(state(db).hash,before.hash,"legacy rows must stay untouched");
 // A safe rollback is pointer-blocking, not dropping receipt or legacy
 // tables. The original complete A and unfinished B remain unchanged.
 assert.equal(db.prepare(`SELECT state FROM ingestion_v2_map_revision_activations
 WHERE document_id=?`).get(documentB)?.state,"blocked");
 db.close();
 copyFileSync(backup,restored);
 const recovered=new DatabaseSync(restored);
 integrity(recovered);
 assert.deepEqual(state(recovered),before);
 assert.deepEqual(allTables(recovered),before.tables);
 assert.equal(recovered.prepare(`SELECT COUNT(*) AS n
  FROM ingestion_v2_publications WHERE document_id=?`).get(documentA)?.n,1);
 assert.equal(recovered.prepare(`SELECT COUNT(*) AS n
  FROM ingestion_v2_publications WHERE document_id=?`).get(documentB)?.n,0);
 assert.equal(recovered.prepare(`SELECT COUNT(*) AS n
  FROM ingestion_v2_vector_receipts WHERE document_id=? AND layer='map'`)
  .get(documentB)?.n,1);
 recovered.close();
 console.log("PASS: local SQLite additive migration idempotent; A publication and B RAW/Evidence/old Map unchanged");
 console.log("PASS: local pre-migration file backup restores exact old schema and data; invalid orphan receipts refused");
}finally{rmSync(lab,{recursive:true,force:true})}
