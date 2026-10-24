import assert from "node:assert/strict";
import {filterPublishedMatches} from "../app/lib/ingestion-publication-visibility.ts";
let generation=1;
const db={prepare:()=>({bind:()=>({first:async()=>({active_generation:generation})})})};
const matches=[{id:"legacy",metadata:{sourceFileId:"doc"}},{id:"g1:chunk",metadata:{sourceFileId:"doc"}},{id:"g2:chunk",metadata:{sourceFileId:"doc"}},{id:"g3:chunk",metadata:{}}];
assert.deepEqual((await filterPublishedMatches(db,matches)).map(x=>x.id),["g1:chunk"]);
generation=2;
assert.deepEqual((await filterPublishedMatches(db,matches)).map(x=>x.id),["g2:chunk"]);
assert.deepEqual((await filterPublishedMatches(null,matches)).map(x=>x.id),["legacy"],"pre-staging legacy-only retrieval remains compatible");
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
];
generation=3;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g3:newer"]);
generation=2;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g2:older"],
 "Restored D1 generation must fence vectors from post-bookmark superseded generation");
console.log("Staged Vectorize visibility respects published D1 generation and fails closed");
