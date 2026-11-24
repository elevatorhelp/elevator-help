import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const env={...process.env,
 GITHUB_ACTIONS:"false",GITHUB_EVENT_NAME:"pull_request",
 GITHUB_REF:"refs/heads/main",
 QA106_B_SHADOW_CONFIRMATION:"",
 GOOGLE_SERVICE_ACCOUNT_JSON:"",
 GEMINI_API_KEY:""};
const result=spawnSync(process.execPath,
 ["scripts/qa-issue106-b-shadow-client.mjs"],
 {cwd:process.cwd(),env,encoding:"utf8",timeout:30000});
assert.equal(result.status,1);
assert.match(result.stderr,/QA106_B_SHADOW_CONTEXT_DENIED/);
assert.doesNotMatch(result.stdout,/PASS:QA106_B_SHADOW_/);
console.log("PASS: B-only remote QA shadow client rejects unapproved local/pull-request context before network or model calls");
