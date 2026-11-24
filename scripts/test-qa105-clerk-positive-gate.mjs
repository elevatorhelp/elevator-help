import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

const run=(env,mode="preflight")=>{
 const r=spawnSync(process.execPath,[
  "scripts/qa105-clerk-positive-probe.mjs",mode],
  {env:{PATH:process.env.PATH||"",
   GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
   GITHUB_REF:"refs/heads/feat/issue106-shadow-map-revision-20261122",
   GITHUB_RUN_ID:"45123456789",RUNNER_TEMP:"/tmp",
   QA105_POSITIVE_CONFIRMATION:"QA105_REAL_TEST_CLERK_ZERO_MODEL",
   QA105_PRIVATE_DEV_VARS:"/tmp/qa105-private/.dev.vars",
   ...env},encoding:"utf8",timeout:10000});
 return r;
};
{
 const r=run({});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/QA105_POSITIVE_REVIEWED_CLERK_TEST_SECRETS_MISSING/);
 assert.doesNotMatch(r.stdout,/PASS:/);
}
{
 const r=run({GITHUB_EVENT_NAME:"push",
  QA105_CLERK_TEST_SECRET_KEY:"sk_test_validshapeonly123456789",
  QA105_CLERK_TEST_USER_ID:"user_QA105ONLY00001"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/QA105_POSITIVE_CONTEXT_DENIED/);
}
{
 const r=run({GEMINI_API_KEY:"never_send_to_ai",
  QA105_CLERK_TEST_SECRET_KEY:"sk_test_validshapeonly123456789",
  QA105_CLERK_TEST_USER_ID:"user_QA105ONLY00001"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/QA105_POSITIVE_CONTEXT_DENIED/);
}
{
 const workflow=readFileSync(
  ".github/workflows/qa105-clerk-positive-test-only-once.yml","utf8");
 assert.match(workflow,/environment: qa-clerk-positive/);
 assert.match(workflow,/QA105_CLERK_TEST_SECRET_KEY: \$\{\{ secrets\.QA105_CLERK_TEST_SECRET_KEY \}\}/);
 assert.doesNotMatch(workflow,/secrets\.QA105_CLERK_TEST_SESSION_JWT/);
 assert.match(workflow,/QA105_CLERK_TEST_USER_ID: \$\{\{ secrets\.QA105_CLERK_TEST_USER_ID \}\}/);
 assert.match(workflow,/github\.event\.head_commit\.message == 'qa105\(test\): authorized real Clerk TEST positive probe zero models'/);
 assert.doesNotMatch(workflow,/secrets\.CLERK_SECRET_KEY/);
 assert.doesNotMatch(workflow,/secrets\.GEMINI_API_KEY/);
 assert.doesNotMatch(workflow,/secrets\.GEMINI_BENCHMARK_API_KEY/);
 const source=readFileSync("scripts/qa105-clerk-positive-probe.mjs","utf8");
 assert.match(source,/https:\/\/api\.clerk\.com\/v1/);
 assert.match(source,/bapi\("\/sessions"/);
 assert.ok(source.includes("frontlineTicketSession(sessionId)"));
 assert.ok(source.includes("freshToken(backendSessionId)"));
 assert.ok(source.includes("/sign_in_tokens"));
 assert.ok(source.includes("/v1/client/sign_ins"));
 assert.ok(source.includes("authorizedParties:[expectedOrigin]"));
 assert.ok(source.includes("QA105_FRONTEND_TEST_SESSION_STRICT_ORIGIN_VERIFIED"));
 assert.doesNotMatch(source,/process\.env\.QA105_CLERK_TEST_SESSION_JWT\s*;/);

 const shell=readFileSync("scripts/qa105-clerk-positive-run.sh","utf8");
 assert.match(shell,/test -s \.open-next\/worker\.js/);
 assert.match(shell,/ln -s "\$QA105_PRIVATE_DEV_VARS" \.dev\.vars/);
 assert.doesNotMatch(shell,/--var "CLERK_SECRET_KEY:/);
}
console.log("PASS:QA105_TEST_ONLY_CLERK_POSITIVE_WORKFLOW_DEFAULT_OFF_NO_NETWORK");

{
 const route=readFileSync("app/api/qa105-exact-citation-probe/route.ts","utf8");
 assert.ok(route.includes('env.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only"'));
 assert.ok(route.includes('env.QA105_AUTH_ORIGIN_DIAG==="true"'));
 assert.ok(route.includes('testOriginMode&&!/^sk_test_/'));
 assert.ok(route.includes('authorizedParties:["http://127.0.0.1:8797"]'));
 assert.ok(route.includes('claims.azp!=="http://127.0.0.1:8797"'));
 assert.ok(route.includes('if(auth.userId!==authorizedQAUser)'));
 const shared=readFileSync("app/lib/request-auth.ts","utf8");
 assert.ok(shared.includes("authorizedParties: [origin]"));
 assert.ok(shared.includes("new URL(request.url).origin"));
 assert.ok(!shared.includes("127.0.0.1:8797"));
}
