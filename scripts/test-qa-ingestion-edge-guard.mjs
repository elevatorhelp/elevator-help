import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// This is a source-level security contract, not a substitute for a real
// Clerk-authenticated /api/ask test against the production-equivalent app.
const source=readFileSync(new URL("../workers/qa-real-app-entry.mjs",import.meta.url),"utf8");
assert.match(source,/QA_INGESTION_TOKEN/);
assert.match(source,/request\.headers\.get\("authorization"\)/);
assert.match(source,/return new Response\("Forbidden",\{status:403\}\)/);
assert.match(source,/request\.method\s*!==\s*"POST"/);
const allow=source.match(/if\(!\[([\s\S]*?)\]\.includes\(url\.pathname\)/);
assert.ok(allow,"Missing strict QA endpoint allowlist");
const endpoints=[...allow[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(endpoints,[
 "/api/drive-ingest-batch",
 "/api/document-map-ingest",
 "/api/qa-evidence-lookup",
]);
assert.ok(!endpoints.includes("/api/ask"),"Do not expose paid/customer chat through ingestion-only QA");

// The real Drive-restart drill mutates isolated D1. Its bearer must never be
// forwarded to production, a lookalike origin or an HTTP redirect.
const recovery=readFileSync(new URL("./qa-drive-recovery-live.mjs",import.meta.url),"utf8");
assert.match(recovery,/QA_ISOLATED_ORIGIN_REQUIRED/);
assert.match(recovery,/QA_UNIQUE_RUN_ID_REQUIRED/);
assert.match(recovery,/target\.origin!==approvedOrigin/);
assert.match(recovery,/target\.href!==approvedOrigin\+"\/"/);
assert.match(recovery,/redirect:"manual"/);
assert.match(recovery,/AbortSignal\.timeout\(30000\)/);

// Exercise preflight failures in a separate process; the invalid origins
// cannot reach fetch or Cloudflare, and no real credential is involved.
const {spawnSync}=await import("node:child_process");
const origin="https://elevator-help-pr61-app-qa.baharmand.workers.dev";
function denied(url,runId="12345"){
 const child=spawnSync(process.execPath,["scripts/qa-drive-recovery-live.mjs"],{
  cwd:new URL("../",import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,""),
  env:{...process.env,QA_APP_BASE_URL:url,QA_INGESTION_TOKEN:"synthetic-only",GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:"1"},
  encoding:"utf8",timeout:5000,
 });
 assert.notEqual(child.status,0,"Unsafe Drive QA preflight unexpectedly succeeded");
 assert.match(child.stderr,/QA_(?:ISOLATED_ORIGIN|UNIQUE_RUN_ID)_REQUIRED/);
 assert.ok(!child.stdout.includes("synthetic-only")&&!child.stderr.includes("synthetic-only"));
}
for(const url of [
 "https://elevator.help",
 "https://elevator-help-pr61-app-qa.baharmand.workers.dev.attacker.example",
 "http://elevator-help-pr61-app-qa.baharmand.workers.dev",
 origin+":8443",origin+"/unexpected-path",origin+"?redirect=https://elevator.help",
])denied(url);
denied(origin,"");


// Execute the actual Drive ingestion preflight expression in an isolated VM.
// Source-level regex alone cannot prove that an unsafe destination is rejected.
const {runInNewContext}=await import("node:vm");
const driveSource=readFileSync(new URL("./drive-ingest.mjs",import.meta.url),"utf8");
const stagedGate=driveSource.match(/if \(STAGED_AUTO_LEASE && \([\s\S]*?\)\) throw new Error\("STAGED_AUTO_LEASE_REQUIRES_ISOLATED_SINGLE_DOCUMENT"\);/);
assert.ok(stagedGate,"Missing staged Drive auto-lease preflight");
const rawEndpoint=origin+"/api/drive-ingest-batch";
const mapEndpoint=origin+"/api/document-map-ingest";
function stagedGateDenies(raw=rawEndpoint,map=mapEndpoint,target="file-1",lease=null){
  try {
    runInNewContext(stagedGate[0],{
      STAGED_AUTO_LEASE:true,TARGET_FILE_ID:target,STAGED_LEASE:lease,
      INGEST_ENDPOINT:raw,DOCUMENT_MAP_ENDPOINT:map,URL,
    });
    return false;
  } catch(error) {
    assert.match(error.message,/STAGED_AUTO_LEASE_REQUIRES_ISOLATED_SINGLE_DOCUMENT/);
    return true;
  }
}
assert.equal(stagedGateDenies(),false,"Exact isolated HTTPS QA routes must remain usable");
for(const [label,raw,map] of [
  ["HTTP downgrade",rawEndpoint.replace("https:","http:"),mapEndpoint.replace("https:","http:")],
  ["alternate port",rawEndpoint.replace(origin,origin+":8443"),mapEndpoint.replace(origin,origin+":8443")],
  ["wrong RAW path",origin+"/api/qa-evidence-lookup",mapEndpoint],
  ["wrong Map path",rawEndpoint,origin+"/api/qa-evidence-lookup"],
  ["RAW query",rawEndpoint+"?next=https://elevator.help",mapEndpoint],
  ["Map fragment",rawEndpoint,mapEndpoint+"#fragment"],
  ["URL credentials",rawEndpoint.replace("https://","https://user:pass@"),mapEndpoint],
  ["production", "https://elevator.help/api/drive-ingest-batch","https://elevator.help/api/document-map-ingest"],
  ["lookalike host",rawEndpoint.replace(".workers.dev",".workers.dev.attacker.example"),mapEndpoint],
  ["trailing slash",rawEndpoint+"/",mapEndpoint],
]) assert.equal(stagedGateDenies(raw,map),true,label+" must be rejected before any network call");
assert.equal(stagedGateDenies(rawEndpoint,mapEndpoint,""),true,"Missing single-file target must fail closed");
assert.equal(stagedGateDenies(rawEndpoint,mapEndpoint,"file-1",{owner:"synthetic"}),true,"Existing staged lease must fail closed");

console.log("PASS: isolated ingestion QA edge denies /api/ask and only allows token-protected POST ingestion/readback routes; live Drive restart is pinned to isolated origin, rejects redirects and requires unique run ID");
