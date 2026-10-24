import assert from "node:assert/strict";
import {filterPublishedMatches} from "../app/lib/ingestion-publication-visibility.ts";
let generation=1;
const db={prepare:()=>({bind:()=>({first:async()=>({active_generation:generation})})})};
const matches=[{id:"legacy",metadata:{sourceFileId:"doc"}},{id:"g1:chunk",metadata:{sourceFileId:"doc"}},{id:"g2:chunk",metadata:{sourceFileId:"doc"}},{id:"g3:chunk",metadata:{}}];
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
];
generation=3;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g3:newer"]);
generation=2;
assert.deepEqual((await filterPublishedMatches(db,rollbackVectors)).map(x=>x.id),["g2:older"],
 "Restored D1 generation must fence vectors from post-bookmark superseded generation");
console.log("Staged Vectorize visibility respects published D1 generation and fails closed");
