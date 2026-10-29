// Safe, idempotent schema compatibility for the dedicated PR61 QA database only.
// Never invoke against production D1.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {assertBothQaConfigs} from "./qa-pr61-assert-isolated-config.mjs";

// Fail closed before ANY remote D1 call. The old single-index every() check
// rejected the valid distinct VECTORIZE_V2 QA binding and silently accepted
// an empty vectorize array. Share the exact reviewed dual-index guard instead.
assertBothQaConfigs();

const execute=(command)=>{
  const result=execFileSync("npx",["wrangler","d1","execute",
    "elevator-help-lease-test-01","--remote","--config","wrangler.qa-app.json",
    "--command",command,"--json"],{
    encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]
  });
  const parsed=JSON.parse(result);
  assert.ok(Array.isArray(parsed) && parsed.length > 0 && parsed.every(entry =>
    entry && entry.success === true && Array.isArray(entry.results)),
    "QA D1 command failed or returned malformed Wrangler JSON");
  return parsed.flatMap(entry=>entry.results||[]);
};
let cols=execute("PRAGMA table_info(ingestion_worker_leases)").map(row=>row.name);
assert.ok(cols.includes("job_key")&&cols.includes("lease_until_ms"),"QA lease table not initialized");
if(!cols.includes("updated_at_ms")){
  execute("ALTER TABLE ingestion_worker_leases ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0");
  cols=execute("PRAGMA table_info(ingestion_worker_leases)").map(row=>row.name);
}
assert.ok(cols.includes("updated_at_ms"),"QA lease timestamp migration failed");
console.log("PASS: isolated QA lease schema compatible with actual E2E");
