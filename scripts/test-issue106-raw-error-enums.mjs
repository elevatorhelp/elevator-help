import assert from "node:assert/strict";
import {classifyQaV2RawError} from "../app/lib/qa-v2-raw-error.ts";
import {redactQa106WorkerLog} from "./qa-issue106-safe-worker-error.mjs";
assert.equal(classifyQaV2RawError("gemini_enrichment",Error("429 quota exceeded: private-source-filename")),
 "V2_RAW_GEMINI_ENRICHMENT_RATE_LIMITED");
assert.equal(classifyQaV2RawError("gemini_embedding",Error("403 permission denied: private-token")),
 "V2_RAW_GEMINI_EMBEDDING_DENIED");
assert.equal(classifyQaV2RawError("vector_staging",Error("Vectorize failure: private-secret")),
 "V2_RAW_VECTOR_STAGING_FAILED");
assert.equal(classifyQaV2RawError("lease_guard",Error("GLOBAL_ARCHIVE_LEASE_STALE")),
 "V2_RAW_LEASE_GUARD_DENIED");
for(const phase of ["validation","lease_guard","gemini_enrichment","workers_ai_embedding",
  "gemini_embedding","epoch_claim","vector_staging"]){
 const code=classifyQaV2RawError(phase,Error("Sensitive internal failure"));
 assert.match(code,/^V2_RAW_(?:VALIDATION|LEASE_GUARD|GEMINI_ENRICHMENT|WORKERS_AI_EMBEDDING|GEMINI_EMBEDDING|EPOCH_CLAIM|VECTOR_STAGING)_FAILED$/);
 const log=redactQa106WorkerLog("private PDF secret\n"+code+" (source details redacted)");
 assert.ok(log.includes("markers="+code));
 assert.ok(!log.includes("private PDF secret"));
}
console.log("PASS: QA106 RAW error stage classifier and redacted Worker public codes");
