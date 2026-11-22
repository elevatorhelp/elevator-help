/**
 * Issue #106 opt-in legacy exact-source evidence leak regression.
 * Offline-only synthetic fixtures. No Cloudflare D1, Vectorize or Gemini.
 */
import assert from "node:assert/strict";
import {
 onlyUnsupersededLegacyRows,type ArchiveEvidenceRow,
} from "../app/lib/archive-evidence-index.ts";
const make=(id:string):ArchiveEvidenceRow=>({
 id,text:"synthetic citation",source_file_id:id,file_name:"fixture.pdf",
 source_path:"qa/fixture.pdf",page:1,chunk_index:0,
 content_type:"standard",source_fingerprint:"a".repeat(64),
 identifier_labels:null,matched_identifiers:1,
});
const rows=[
 make("published-A"),make("old-incomplete-B"),make("untouched-C"),
 make("old-incomplete-B"),
];
function fake(opts:{map?:boolean;immutable?:boolean;missingRevision?:boolean}={}){
 const called:{publications:number;candidates:number}={publications:0,candidates:0};
 const db={
  __immutableReadGate:opts.immutable===true,
  __mapRevisionReadGate:opts.map===true,
  prepare:(sql:string)=>{
   if(!/^SELECT /i.test(sql))throw Error("QA106_TEST_WRITE_ATTEMPT");
   return {bind:(id:string)=>({first:async()=>{
    if(sql.includes("ingestion_v2_map_revision_candidates")){
      called.candidates++;
      if(opts.missingRevision)throw Error("no such table: ingestion_v2_map_revision_candidates");
      return id==="old-incomplete-B"?{present:1}:null;
    }
    if(sql.includes("ingestion_v2_publications")){
      called.publications++;
      return id==="published-A"?{active_generation:1}:null;
    }
    throw Error("unexpected D1 read");
   }})};
  },
 };
 return {db,called};
}
// Existing default behavior is preserved with both gates off (identity).
const defaultDb=fake();
assert.equal(await onlyUnsupersededLegacyRows(defaultDb.db,rows),rows);
assert.deepEqual(defaultDb.called,{publications:0,candidates:0});
// Original immutable gate alone never consults new candidate tables.
const legacy=fake({immutable:true});
assert.deepEqual((await onlyUnsupersededLegacyRows(
 legacy.db,rows)).map(x=>x.source_file_id),
 ["old-incomplete-B","untouched-C","old-incomplete-B"]);
assert.equal(legacy.called.candidates,0);
// Opt-in read gate blocks B as soon as ANY revision candidate exists,
// regardless of whether its active pointer is published or blocked.
const opted=fake({map:true,immutable:true});
assert.deepEqual((await onlyUnsupersededLegacyRows(
 opted.db,rows)).map(x=>x.source_file_id),["untouched-C"]);
assert.equal(opted.called.candidates,3,
 "each document's candidate query must be cached, not repeated per row");
assert.equal(opted.called.publications,3);
// If map flag was accidentally set without old immutable flag, still fail
// closed for revised B rather than exposing legacy B.
const onlyRevision=fake({map:true});
assert.deepEqual((await onlyUnsupersededLegacyRows(
 onlyRevision.db,rows)).map(x=>x.source_file_id),["untouched-C"]);
// A missing migration schema must not silently fall back to source text.
const noSchema=fake({map:true,missingRevision:true});
assert.deepEqual(await onlyUnsupersededLegacyRows(noSchema.db,rows),[]);
console.log("PASS: opt-in revision candidate hides B legacy citations; default unchanged; missing D1 table fails closed");
