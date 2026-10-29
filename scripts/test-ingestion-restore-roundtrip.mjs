import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";

const staged=readFileSync(new URL("../docs/ingestion-staged-publication-schema.sql",import.meta.url),"utf8");
const full=readFileSync(new URL("../docs/ingestion-full-publication-schema.sql",import.meta.url),"utf8");
const db=new DatabaseSync(":memory:");
db.exec(staged);
db.exec(full);
db.prepare("INSERT INTO ingestion_document_publications VALUES (?,?,?,?)").run("document-a","document-a",2,10);
const row=["document-a",2,"chunk-a",100,"fingerprint-a"];
db.prepare("INSERT INTO ingestion_staged_receipts VALUES (?,?,?,?,?)").run(...row);
db.prepare("INSERT INTO ingestion_staged_evidence VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
 "document-a",2,"evidence-a","fingerprint-a","Genuine test evidence about E16","test.pdf","QA",3,0,
 '[{"key":"E16","label":"E16"}]','["5.2"]',100);
db.prepare("INSERT INTO ingestion_staged_map_receipts VALUES (?,?,?,?,?)").run("document-a",2,"map-a","fingerprint-a",100);
const state=()=>({
 publication:db.prepare("SELECT * FROM ingestion_document_publications ORDER BY document_id").all(),
 raw:db.prepare("SELECT * FROM ingestion_staged_receipts ORDER BY chunk_id").all(),
 evidence:db.prepare("SELECT * FROM ingestion_staged_evidence ORDER BY chunk_id").all(),
 map:db.prepare("SELECT * FROM ingestion_staged_map_receipts ORDER BY chunk_id").all()
});
const expected=state();
// Same-memory SQLite backup is a controlled rehearsal, not a Cloudflare Time Travel restore.
// Serialize as SQL so no production credentials, archive text, or remote D1 mutation is involved.
const sql=[];
for(const table of ["ingestion_document_publications","ingestion_staged_receipts","ingestion_staged_evidence","ingestion_staged_map_receipts"]){
 const columns=db.prepare("PRAGMA table_info("+table+")").all().map(c=>c.name);
 for(const values of db.prepare("SELECT * FROM "+table).all()){
  const literals=columns.map(col=>{
   const v=values[col];
   if(v===null)return "NULL";
   if(typeof v==="number")return String(v);
   return "'"+String(v).replaceAll("'","''")+"'";
  });
  sql.push("INSERT INTO "+table+" ("+columns.join(",")+") VALUES ("+literals.join(",")+")");
 }
}
db.exec("DELETE FROM ingestion_staged_evidence; DELETE FROM ingestion_staged_map_receipts; DELETE FROM ingestion_staged_receipts; DELETE FROM ingestion_document_publications");
assert.equal(state().publication.length,0);
db.exec(sql.join(";")+";");
assert.deepEqual(state(),expected,"restore must preserve manifest, generation, source and all three receipt layers");
assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
console.log("PASS: local full-publication SQL snapshot/restore preserves generation, exact evidence and RAW/Map receipts");
