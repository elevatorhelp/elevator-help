import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync("wrangler.qa-citation.json","utf8"));
assert.equal(c.name,"elevator-help-pr63-citation-qa");
assert.equal(c.main,"workers/qa-citation-entry.mjs");
assert.equal(c.workers_dev,true);
assert.deepEqual(c.compatibility_flags,["nodejs_compat"]);
assert.deepEqual(c.assets,{directory:".open-next/assets",binding:"ASSETS"});
assert.deepEqual(c.d1_databases,[{
  binding:"CORTEX_DB",database_name:"elevator-help-lease-test-01",
  database_id:"02716877-15e3-4478-9e24-f1ba6e5dfb00"
}]);
assert.deepEqual(c.vectorize,[
  {binding:"VECTORIZE",index_name:"elevator-help-staging-test"},
  {binding:"VECTORIZE_V2",index_name:"elevator-help-staging-test-v2"}
]);
assert.deepEqual(c.vars,{
  AUTH_REQUIRED:"true",DAILY_QUESTION_LIMIT_ENABLED:"false",
  CORTEX_LEARNING_ENABLED:"false",MULTILINGUAL_RETRIEVAL_ENABLED:"true",
  GEMINI_MAX_CALLS_PER_QUESTION:"2"
});
assert.deepEqual(c.ai,{binding:"AI"});
assert.equal(c.observability?.enabled,false);
assert.deepEqual(c.ratelimits,[{
  name:"GEMINI_ASK_RATE_LIMITER",namespace_id:"24001",
  simple:{limit:30,period:60}
}]);
const allowed=new Set(["$schema","name","main","compatibility_date",
  "compatibility_flags","assets","d1_databases","observability","vars",
  "ratelimits","ai","vectorize","workers_dev"]);
for(const key of Object.keys(c))assert.ok(allowed.has(key));
const entry=readFileSync("workers/qa-citation-entry.mjs","utf8");
assert.ok(entry.includes('u.pathname!=="/api/ask"'));
assert.ok(entry.includes("CLERK_QA_TEST_USER_ID"));
assert.ok(entry.includes("authorizedParties:[u.origin]"));
assert.ok(!entry.includes("INGESTION_TOKEN"));
console.log("PASS: isolated citation Worker strictly bound to two QA indices, QA D1, Clerk test account and one question");
