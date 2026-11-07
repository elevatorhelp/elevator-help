import assert from "node:assert/strict";
import {parseArchiveRunMetrics,readArchiveRunMetrics} from "../app/lib/admin-archive-run-metrics.ts";
const log = [
  "Found 241 supported documents in configured Drive scope",
  "Ingestion phase preference: map; selected: raw",
  "Archive backlog (all pending): evidence=104, raw=162, map=168",
  "Archive eligible queues: evidence=104, raw=76, map=6",
  "76 document(s) need the raw phase",
  "Done. Attempted 2 file(s); 0 failed; 74 not selected this run. Gemini calls reserved: 6/60.",
].join("\n");
const result = parseArchiveRunMetrics(log);
assert.equal(result?.supportedFiles,241);
assert.deepEqual(result?.pending,{evidence:104,raw:162,map:168});
assert.deepEqual(result?.processed,{evidence:137,raw:79,map:73});
assert.equal(result?.pendingOperations,434);
assert.equal(result?.selectedPhase,"raw");
assert.equal(result?.attempted,2);
assert.equal(result?.failed,0);
assert.equal(result?.newFiles,null);
assert.equal(result?.estimatedRemainingDays,null);
assert.equal(parseArchiveRunMetrics("Found 241 supported documents"),null);
assert.equal(parseArchiveRunMetrics(log.replace("evidence=104","evidence=999")),null);
assert.equal(parseArchiveRunMetrics(log.replace("Attempted 2","Attempted 9")),null);
let requests=0;
const fetchImpl = (async (url:string)=>{
  requests++;
  if (url.endsWith("/jobs?per_page=10")) return Response.json({jobs:[{id:128504126838,name:"ingest",conclusion:"success"}]});
  if (url.endsWith("/jobs/128504126838/logs")) return new Response(log,{status:200});
  throw Error("Unknown URL");
}) as typeof fetch;
const fetched=await readArchiveRunMetrics(42406136917,{fetchImpl});
assert.equal(fetched?.supportedFiles,241);
assert.equal(requests,2);
assert.equal(await readArchiveRunMetrics(-1,{fetchImpl}),null);
assert.equal(requests,2);
assert.equal(await readArchiveRunMetrics(42406136917,{fetchImpl:(async()=>new Response("Forbidden",{status:403})) as typeof fetch}),null);
console.log("GitHub archive run aggregate parser and read-only mock tests PASS.");
