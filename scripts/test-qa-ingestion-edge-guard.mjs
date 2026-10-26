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

console.log("PASS: isolated ingestion QA edge denies /api/ask and only allows token-protected POST ingestion/readback routes; live Drive restart is pinned to isolated origin, rejects redirects and requires unique run ID");
