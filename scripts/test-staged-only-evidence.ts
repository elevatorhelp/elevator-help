import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {searchArchiveEvidenceIndex} from "../app/lib/archive-evidence-index.ts";
const db=new DatabaseSync(":memory:");
db.exec(readFileSync("docs/ingestion-staged-publication-schema.sql","utf8"));
db.exec(readFileSync("docs/ingestion-full-publication-schema.sql","utf8"));
db.exec("INSERT INTO ingestion_document_publications(document_id,job_key,active_generation,updated_at_ms) VALUES('only-staged','only-staged',1,0)");
db.prepare("INSERT INTO ingestion_staged_evidence(document_id,generation,chunk_id,source_fingerprint,text,file_name,source_path,page,chunk_index,identifiers_json,clauses_json,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
.run("only-staged",1,"e1","rev1","Synthetic equipment verification section 5.2","sample.pdf","qa",1,0,
JSON.stringify([{key:"E16",label:"E-16"}]),JSON.stringify(["5.2"]),1);
const d1={prepare:(sql:string)=>({bind:(...values:unknown[])=>({all:async()=>({results:db.prepare(sql).all(...(values as []))})})})};
const ref=[{key:"E16",label:"E-16",structured:true}];
const rows=await searchArchiveEvidenceIndex(d1,ref,[]);
assert.equal(rows.length,1,"published evidence must be searchable without legacy tables");
assert.equal(rows[0].source_file_id,"only-staged");
assert.equal(rows[0].page,1);
db.exec("UPDATE ingestion_document_publications SET active_generation=0 WHERE document_id='only-staged'");
assert.equal((await searchArchiveEvidenceIndex(d1,ref,[])).length,0,"unpublished evidence invisible");
console.log("PASS: staged-only D1 exact lookup without archive or FTS tables");
