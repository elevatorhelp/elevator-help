// Safe, idempotent schema compatibility for the dedicated PR61 QA database only.
// Never invoke against production D1.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const config=JSON.parse(readFileSync(new URL("../wrangler.qa-app.json",import.meta.url),"utf8"));
assert.equal(config.name,"elevator-help-pr61-app-qa");
assert.equal(config.d1_databases?.length,1);
assert.equal(config.d1_databases[0].binding,"CORTEX_DB");
assert.equal(config.d1_databases[0].database_name,"elevator-help-lease-test-01");
assert.equal(config.d1_databases[0].database_id,"02716877-15e3-4478-9e24-f1ba6e5dfb00");
assert.ok(config.vectorize?.every(v=>v.index_name==="elevator-help-staging-test"));
const execute=(command)=>{
  const result=execFileSync("npx",["wrangler","d1","execute",
    "elevator-help-lease-test-01","--remote","--config","wrangler.qa-app.json",
    "--command",command,"--json"],{
    encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]
  });
  const parsed=JSON.parse(result);
  assert.ok(Array.isArray(parsed)&&parsed[0]?.success!==false,"QA D1 command failed");
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
