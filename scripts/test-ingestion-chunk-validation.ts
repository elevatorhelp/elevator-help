import assert from "node:assert/strict";
import {hasValidIngestionChunk} from "../app/lib/ingestion-chunk-validation.ts";
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
  {...valid,text:null}, {...valid,fileName:null},
  {...valid,sourcePath:null}, null, [],
]) assert.equal(hasValidIngestionChunk(bad),false,
  `invalid chunk must not enter the archive: ${JSON.stringify(bad)}`);

const route=readFileSync(new URL("../app/api/drive-ingest-batch/route.ts",import.meta.url),"utf8");
assert.match(route,/import \{ hasValidIngestionChunk \} from "\.\.\/\.\.\/lib\/ingestion-chunk-validation";/);
assert.match(route,/if \(!hasValidIngestionChunk\(chunk\)\)/);
console.log("PASS: ingestion rejects invalid physical pages and chunk identities before side effects");
