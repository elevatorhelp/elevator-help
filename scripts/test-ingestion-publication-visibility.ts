import assert from "node:assert/strict";
import {filterPublishedMatches} from "../app/lib/ingestion-publication-visibility.ts";
const stagedSource=(item:{id:string;metadata?:Record<string,unknown>})=>
 item.id.startsWith("g") ? {...item,metadata:{
  status:"active",text:"Exact source text",fileName:"source.pdf",
  sourcePath:"archive/source.pdf",sourceFingerprint:"revision-current",page:1,
  ...item.metadata,
 }} : item;
let generation=1;
const db={prepare:()=>({bind:()=>({first:async()=>({active_generation:generation})})})};
const matches=[{id:"legacy",metadata:{sourceFileId:"doc"}},{id:"g1:chunk",metadata:{sourceFileId:"doc"}},{id:"g2:chunk",metadata:{sourceFileId:"doc"}},{id:"g3:chunk",metadata:{}}].map(stagedSource);
assert.deepEqual((await filterPublishedMatches(db,matches)).map(x=>x.id),["g1:chunk"]);
generation=2;
assert.deepEqual((await filterPublishedMatches(db,matches)).map(x=>x.id),["g2:chunk"]);
assert.deepEqual((await filterPublishedMatches(null,matches)).map(x=>x.id),["legacy"],"pre-staging legacy-only retrieval remains compatible");
const unattributedLegacy=[{id:"legacy-without-document",metadata:{}},{id:"legacy-without-metadata"}];
assert.deepEqual(await filterPublishedMatches(db,unattributedLegacy),[],
 "Configured D1 must reject legacy vectors without sourceFileId: publication cannot be verified");
assert.deepEqual(await filterPublishedMatches(null,unattributedLegacy),unattributedLegacy,
 "Deliberately unconfigured legacy-only deployments retain historical compatibility");
assert.deepEqual(await filterPublishedMatches({},matches),[],
 "Malformed configured D1 binding must not expose superseded legacy vectors");
assert.deepEqual(await filterPublishedMatches({prepare:null},unattributedLegacy),[],
 "Unusable configured D1 must reject unattributed legacy vectors");

// Invalid staged IDs must never masquerade as legacy Vectorize hits.
const malformedStaged=["g0:chunk","g01:chunk","g999999999999999999999:chunk","g1:"]
 .map(id=>({id,metadata:{sourceFileId:"doc"}}));
assert.deepEqual(await filterPublishedMatches(null,malformedStaged),[],
 "Malformed staged IDs must not bypass the gate when D1 is absent");
assert.deepEqual(await filterPublishedMatches(db,malformedStaged),[],
 "Malformed staged IDs must not bypass configured D1 checks");
const noPublication={prepare:()=>({bind:()=>({first:async()=>null})})};
assert.deepEqual(await filterPublishedMatches(noPublication,malformedStaged),[],
 "Malformed staged IDs must not appear as legacy when no publication exists");

assert.deepEqual((await filterPublishedMatches(db,matches,true)).map(x=>x.id),["g2:chunk"]);
const unavailable={prepare:()=>{throw Error("D1 network timeout");}};
assert.deepEqual((await filterPublishedMatches(unavailable,matches)).map(x=>x.id),[],
 "D1 outage must never resurrect superseded legacy vectors");
const failedQuery={prepare:()=>({bind:()=>({first:async()=>{throw Error("D1 network timeout")}})})};
assert.deepEqual((await filterPublishedMatches(failedQuery,matches)).map(x=>x.id),[],
 "D1 fetch outage must fail closed for all generations");
const oldSchema={prepare:()=>({bind:()=>({first:async()=>{throw Error("no such table: ingestion_document_publications")}})})};
assert.deepEqual((await filterPublishedMatches(oldSchema,matches)).map(x=>x.id),["legacy"],
 "Pre-staging schema compatibility may preserve legacy only");
assert.deepEqual((await filterPublishedMatches(oldSchema,matches,true)).map(x=>x.id),[],
 "strict staged-only gate never admits legacy rows");
// A Cloudflare D1 Time Travel rollback changes the active D1 generation,
// not automatically the Vectorize records. Superseded staged vector matches
// must become invisible immediately even if old/new vectors coexist.
const rollbackVectors=[
 {id:"legacy",metadata:{sourceFileId:"doc"}},
 {id:"g2:older",metadata:{sourceFileId:"doc"}},
 {id:"g3:newer",metadata:{sourceFileId:"doc"}},
].map(stagedSource);
generation=3;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g3:newer"]);
generation=2;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g2:older"],
 "Restored D1 generation must fence vectors from post-bookmark superseded generation");
// Many chunks of one document must not cause one D1 query per chunk.
// The cache is per call, not global: a later rollback must be observed.
let lookupCount=0;
const countingDb={prepare:()=>({bind:(documentId:string)=>({first:async()=>{
 lookupCount++;
 return {active_generation:documentId==="doc" ? 2 : 4};
}})})};
const repeated=[
 ...Array.from({length:40},(_,i)=>({id:"g2:chunk-"+i,metadata:{sourceFileId:"doc"}})),
 ...Array.from({length:12},(_,i)=>({id:"g4:other-"+i,metadata:{sourceFileId:"other"}})),
 {id:"g3:stale",metadata:{sourceFileId:"doc"}},
 {id:"legacy",metadata:{sourceFileId:"doc"}},
].map(stagedSource);
assert.equal((await filterPublishedMatches(countingDb,repeated)).length,52);
assert.equal(lookupCount,2,"D1 reads must be bounded by unique sourceFileId, not Vectorize match count");
await filterPublishedMatches(countingDb,repeated);
assert.equal(lookupCount,4,"Cache must not outlive one request or mask later D1 generation changes");
let outageReads=0;
const sharedOutage={prepare:()=>({bind:()=>({first:async()=>{
 outageReads++;
 throw Error("D1 timeout");
}})})};
assert.deepEqual(await filterPublishedMatches(sharedOutage,repeated),[],
 "Shared D1 lookup failure must fail closed for staged and legacy matches");
assert.equal(outageReads,2,"A D1 outage must not be retried once per vector chunk");
// Publication can be correct in D1 while a Vectorize record is later
// tombstoned or its source-page metadata is incomplete. Never cite it.
const published=stagedSource({id:"g2:published",metadata:{sourceFileId:"doc"}});
assert.deepEqual(await filterPublishedMatches(db,[published]),[published]);
for(const invalid of [
 {status:"deleted"},{status:undefined},{text:"  "},{text:null},
 {fileName:""},{sourcePath:null},{sourceFingerprint:""},
 {sourceFingerprint:null},{page:0},{page:"1"},{page:1.5},
]){
 const corrupted={...published,metadata:{...published.metadata,...invalid}};
 assert.deepEqual(await filterPublishedMatches(db,[corrupted]),[],
  "Published staged vector with inactive or missing source-page provenance must fail closed");
 assert.deepEqual(await filterPublishedMatches(db,[corrupted],true),[],
  "Strict staged retrieval must also reject corrupt published source metadata");
}
// Existing pre-staging documents may lack these newer fields; keep legacy
// retrieval semantics while requiring them for immutable staged generations.
assert.deepEqual(await filterPublishedMatches(null,[{id:"legacy",metadata:{}}]),
 [{id:"legacy",metadata:{}}]);
console.log("Staged Vectorize visibility respects published D1 generation and active source-page provenance");
