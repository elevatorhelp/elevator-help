import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {searchArchiveEvidenceIndex} from "../app/lib/archive-evidence-index.ts";
const db=new DatabaseSync(":memory:");
db.exec(readFileSync("migrations/0002_archive_evidence.sql","utf8"));
db.exec(readFileSync("migrations/0003_archive_compact_references.sql","utf8"));
db.exec(readFileSync("docs/ingestion-staged-publication-schema.sql","utf8"));
db.exec(readFileSync("docs/ingestion-full-publication-schema.sql","utf8"));
const adapter={prepare:(sql:string)=>({bind:(...params:unknown[])=>({
 all:async()=>({results:db.prepare(sql).all(...(params as []))})
})})};
const reference=[{key:"E16",label:"E-16",structured:true}];
db.prepare("INSERT INTO archive_chunks(id,text,source_file_id,file_name,source_path,page,chunk_index,updated_at) VALUES(?,?,?,?,?,?,?,?)").run("legacy","OLD","doc","x.pdf","a",1,0,1);
db.prepare("INSERT INTO archive_chunk_identifiers VALUES(?,?,?)").run("legacy","E16","E-16");
db.prepare("INSERT INTO ingestion_document_publications(document_id,job_key,active_generation,updated_at_ms) VALUES(?,?,?,?)").run("doc","doc",0,0);
const stage=db.prepare("INSERT INTO ingestion_staged_evidence(document_id,generation,chunk_id,source_fingerprint,text,file_name,source_path,page,chunk_index,identifiers_json,clauses_json,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
for(const [generation,id] of [[1,"v1"],[2,"v2"]] as const){
 stage.run("doc",generation,id,"revision-"+generation,"Evidence "+id,"x.pdf","a",1,0,JSON.stringify([{key:"E16",label:"E-16"}]),"[]",1);
}
const get=()=>searchArchiveEvidenceIndex(adapter,reference);
assert.deepEqual((await get()).map(x=>x.id),["legacy"],"unpublished records invisible");
db.exec("UPDATE ingestion_document_publications SET active_generation=1 WHERE document_id='doc'");
assert.deepEqual((await get()).map(x=>x.id),["v1"],"only first active generation");
db.exec("UPDATE ingestion_document_publications SET active_generation=2 WHERE document_id='doc'");
assert.deepEqual((await get()).map(x=>x.id),["v2"],"old version and legacy invisible");
db.exec("UPDATE ingestion_document_publications SET active_generation=0 WHERE document_id='doc'");
assert.deepEqual((await get()).map(x=>x.id),["legacy"],"legacy remains for unmigrated doc");
db.exec("DROP TABLE ingestion_staged_evidence");
assert.deepEqual((await get()).map(x=>x.id),["legacy"],"absent staging schema backward compatible");
db.close();
console.log("PASS: exact evidence retrieval selects published generation only");
