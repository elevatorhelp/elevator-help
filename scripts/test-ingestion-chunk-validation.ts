import assert from "node:assert/strict";
import {hasValidIngestionChunk,hasValidStagedChunkBatch,parseDriveIngestAction} from "../app/lib/ingestion-chunk-validation.ts";
import {readFileSync} from "node:fs";

const valid = {id:"raw-1",text:"Source evidence",sourceFileId:"doc-1",
  fileName:"manual.pdf",sourcePath:"qa/manual.pdf",page:2,chunkIndex:0};
assert.equal(hasValidIngestionChunk(valid),true);
assert.equal(hasValidIngestionChunk({...valid,page:1,chunkIndex:1}),true);
for (const bad of [
  {...valid,page:0}, {...valid,page:-1}, {...valid,page:1.5},
  {...valid,page:Number.MAX_SAFE_INTEGER+1}, {...valid,page:NaN},
  {...valid,chunkIndex:-1}, {...valid,chunkIndex:0.5},
  {...valid,chunkIndex:Number.MAX_SAFE_INTEGER+1},
  {...valid,id:" "}, {...valid,sourceFileId:""},
  {...valid,text:""}, {...valid,text:" \t "},
  {...valid,fileName:""}, {...valid,fileName:" \t "},
  {...valid,sourcePath:""}, {...valid,sourcePath:" \t "},
  {...valid,text:null}, {...valid,fileName:null},
  {...valid,sourcePath:null}, null, [],
]) assert.equal(hasValidIngestionChunk(bad),false,
  `invalid chunk must not enter the archive: ${JSON.stringify(bad)}`);

const route=readFileSync(new URL("../app/api/drive-ingest-batch/route.ts",import.meta.url),"utf8");
assert.match(route,/import \{ hasValidIngestionChunk, hasValidStagedChunkBatch, parseDriveIngestAction \} from "\.\.\/\.\.\/lib\/ingestion-chunk-validation";/);
assert.match(route,/if \(!hasValidIngestionChunk\(chunk\)\)/);
const lease={jobKey:"doc-1",generation:7};
const validStaged={...valid,sourceFingerprint:"revision-1"};
assert.equal(hasValidStagedChunkBatch([validStaged],lease),true);
assert.equal(hasValidStagedChunkBatch([validStaged,{...validStaged,id:"raw-2",page:3}],lease),true);
for(const bad of [
  null, {jobKey:"doc-2",generation:7}, {jobKey:"doc-1",generation:0},
]) assert.equal(hasValidStagedChunkBatch([validStaged],bad as typeof lease|null),false);
for(const bad of [
  {...validStaged,sourceFileId:"doc-2"},
  {...validStaged,sourceFingerprint:" "},
  {...validStaged,sourceFingerprint:"f".repeat(513)},
  {...validStaged,id:"x".repeat(513)},
  {...validStaged,id:"x".repeat(510)}, // 3-byte g7: prefix exceeds Vectorize ID limit
]) assert.equal(hasValidStagedChunkBatch([bad],lease),false,
  `invalid staged RAW batch must fail before paid calls: ${JSON.stringify({idLength:bad.id.length,sourceFileId:bad.sourceFileId})}`);
assert.equal(hasValidStagedChunkBatch([validStaged,validStaged],lease),false,
  "duplicate staged IDs must be rejected before paid embeddings");
assert.equal(hasValidStagedChunkBatch([],lease),false);
assert.equal(hasValidStagedChunkBatch(Array(9).fill(validStaged),lease),false);
// A source-level ordering regression protects the real HTTP route, not just
// the pure helper: invalid ownership/ID bounds must be rejected before AI calls.
const preflight=route.indexOf("!hasValidStagedChunkBatch(chunks, publicationLease)");
const gemini=route.indexOf("const enriched = await enrichChunks(chunks, apiKey");
const workersAi=route.indexOf("const embeddingResult = await ai.run(");
const multilingual=route.indexOf("const multilingualEmbeddings = await embedRetrievalDocuments(");
assert.ok(preflight>0 && gemini>preflight && workersAi>preflight &&
  multilingual>preflight,"staged preflight must precede all paid embedding calls");
assert.match(route,/import \{ hasValidIngestionChunk, hasValidStagedChunkBatch, parseDriveIngestAction \}/);
console.log("PASS: staged lease/ID bounds reject invalid batches before paid embedding calls");
console.log("PASS: ingestion rejects invalid physical pages and chunk identities before side effects");

const acceptedActions=[
  "upsert","index_evidence","delete","status",
  "publish_staged","publish_full","lease_claim","lease_renew",
];
for(const action of acceptedActions)
  assert.equal(parseDriveIngestAction(action),action);
assert.equal(parseDriveIngestAction(undefined),"upsert",
  "Only an absent action may default to legacy upsert");
for(const invalid of ["", "UPSERT", "unknown", "upsert ", null, false, 0, {}, []])
  assert.equal(parseDriveIngestAction(invalid),null,
    `unsupported action must fail closed: ${JSON.stringify(invalid)}`);
const actionPreflight=route.indexOf("const action = parseDriveIngestAction(body?.action)");
const leaseAction=route.indexOf('body?.action === "lease_claim"');
assert.ok(actionPreflight>0 && actionPreflight<leaseAction &&
  actionPreflight<gemini && actionPreflight<workersAi &&
  actionPreflight<multilingual,
  "Unknown action must be rejected before lease, D1 and paid AI calls");
assert.match(route,/error:"INVALID_INGEST_ACTION"/);
assert.doesNotMatch(route,/body\?\.action \|\| "upsert"/);
console.log("PASS: unknown/malformed ingestion actions cannot silently invoke paid upsert");
