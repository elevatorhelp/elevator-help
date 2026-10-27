import assert from 'node:assert/strict';
import {hasExactQaVectorReadback} from './qa-pr61-vector-readback.mjs';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../wrangler.qa-app.json',import.meta.url),'utf8'));
const runner=readFileSync(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');

const multipageWorkflow=readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml',import.meta.url),'utf8');
// The exact isolated resource check must execute BEFORE any remote mutation/deploy.
for (const [name,qa] of [['actual-app',workflow],['multipage',multipageWorkflow]]) {
  const guard=qa.indexOf('node scripts/qa-pr61-assert-isolated-config.mjs');
  const test=qa.indexOf('node scripts/test-qa-pr61-assert-isolated-config.mjs');
  const firstRemote=qa.indexOf('npx wrangler d1 execute');
  assert.ok(guard>0 && test>guard && firstRemote>test,
    name+' must validate QA-only config and negative fixtures before remote D1 writes');
  assert.match(qa,/run: npm ci/,name+' must install from pinned lockfile');
  assert.doesNotMatch(qa,/npm install\b|npm update\b/,
    name+' must not re-resolve dependencies after npm ci');
}
// Cloudflare CLI diagnostics may include headers, credentials or source text.
// Do not stream raw deploy logs into durable GitHub Actions output.
assert.match(multipageWorkflow,
  /^\s*npx wrangler deploy --config wrangler\.qa-app-deployed\.json > \/tmp\/qa61-deploy\.log 2>&1\s*$/m,
  'deployed QA Worker must capture both stdout and stderr locally');
assert.doesNotMatch(multipageWorkflow,/npx wrangler deploy[^\n]*\|\s*tee\b/,
  'QA deploy must not tee raw Wrangler diagnostics into Actions logs');
assert.doesNotMatch(multipageWorkflow,/^\s*(?:cat|tail|head|sed|awk)\b[^\n]*qa61-deploy\.log/m,
  'QA failure must not print raw deployment diagnostics');

// Both manual QA workflows mutate the SAME isolated D1 database and Vectorize
// indices. Separate concurrency groups allow overlapping publication/reset
// operations and make readback evidence nondeterministic.
const qaGroup=(text)=>text.match(/^  group: ([a-z0-9-]+)$/m)?.[1] ?? null;
assert.equal(qaGroup(workflow),'qa-pr61-isolated-d1-mutating',
  'actual-app must use the shared isolated QA mutation lock');
assert.equal(qaGroup(multipageWorkflow),qaGroup(workflow),
  'multipage Drive and actual-app QA must not mutate shared D1/Vectorize concurrently');
for(const [name,qa] of [['actual-app',workflow],['multipage',multipageWorkflow]]) {
  assert.match(qa,/^  workflow_dispatch:/m,name+' must require manual dispatch');
  assert.doesNotMatch(qa,/^  (?:push|pull_request|schedule|workflow_run):/m,
    name+' must not automatically mutate QA resources');
  assert.match(qa,/^  cancel-in-progress: false$/m,
    name+' must queue rather than cancel an in-flight QA run');
}

assert.match(workflow,/^  workflow_dispatch:/m,'actual-app cloud QA must be manually dispatched');
assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m,'no automatic cloud QA triggers');
assert.match(workflow,/allow_isolated_d1_mutation:[\s\S]*?required: true[\s\S]*?default: false/,'existing isolated D1 mutation must require explicit opt-in');
assert.ok(workflow.includes("    if: ${{ github.event_name == 'workflow_dispatch' && inputs.allow_isolated_d1_mutation == true }}"),'actual-app entire job must be gated before D1 bootstrap');
assert.match(workflow,/allow_paid_gemini:[\s\S]*?default: false/,'Gemini spending must be explicitly opted into');
assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/,'must check out the dispatched exact SHA');
assert.match(workflow,/\$GITHUB_EVENT_NAME.*workflow_dispatch/,'paid path must require manual event');
assert.match(workflow,/ALLOW_PAID_GEMINI:-false/,'paid path must fail closed');
assert.match(workflow,/qa-pr61-ensure-lease-schema\.mjs/,'isolated D1 lease schema reconciliation required');
// Worker logs may contain non-hex credentials, headers or source text.
// Hex-only redaction does not make persistent Actions logs safe.
assert.doesNotMatch(workflow,/^\s*(?:grep|cat|tail|head|sed|awk)\b[^\n]*qa-app-worker\.log/m,
  'QA startup failure must not dump worker logs to Actions output');
assert.match(workflow,/QA worker startup diagnostics withheld/,
  'QA startup failure must explain why diagnostics were withheld');
// Lockfile fidelity: no second mutable npm resolution after npm ci.
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const packageLock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const locked=packageLock.packages[''];
assert.equal(packageJson.devDependencies['@opennextjs/cloudflare'],'1.20.12');
assert.equal(locked.devDependencies['@opennextjs/cloudflare'],'1.20.12');
assert.equal(packageJson.dependencies.next,'16.4.2');
assert.equal(locked.dependencies.next,'16.4.2');
assert.match(workflow,/run: npm ci/,'QA must install exactly from the lockfile');
assert.doesNotMatch(workflow,/npm install\b|npm update\b/,'no mutable dependency resolution after npm ci');
assert.match(workflow,/Verify exact lockfile-pinned OpenNext and Next versions/);
assert.equal(config.name,'elevator-help-pr61-app-qa');
assert.equal(config.vars.INGESTION_COMPLETE_PUBLICATION,'false','RAW-only QA must not inherit complete publication');
assert.deepEqual(config.d1_databases.map(x=>x.database_name),['elevator-help-lease-test-01']);
assert.equal(config.d1_databases[0].database_id,'02716877-15e3-4478-9e24-f1ba6e5dfb00');
assert.ok(Array.isArray(config.vectorize)&&config.vectorize.length>0);
assert.deepEqual(Object.fromEntries(config.vectorize.map(x=>[x.binding,x.index_name])),{
  VECTORIZE:'elevator-help-staging-test',
  VECTORIZE_V2:'elevator-help-staging-test-v2',
},'QA must use independent legacy and multilingual Vectorize indices');
assert.equal(new Set(config.vectorize.map(x=>x.index_name)).size,2,'two bindings must not alias one index');
assert.match(runner,/elevator-help-lease-test-01/);
assert.match(runner,/elevator-help-staging-test/);
// A stale ID from another revision must never satisfy isolated dual-index recovery QA.
assert.match(runner,/hasExactQaVectorReadback\(records,expectedIds,doc,fp\)/);
assert.match(runner,/redirect:"manual",signal:AbortSignal.timeout\(30000\)/,
  'Cloudflare bearer must not follow redirects and reads must be bounded');
const idA={id:'qa:1',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:1}};
const idB={id:'qa:2',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:1}};
assert.equal(hasExactQaVectorReadback([idA,idB],['qa:1','qa:2'],'qa-doc','rev-1'),true);
assert.equal(hasExactQaVectorReadback([{...idA,metadata:{...idA.metadata,page:'1'}},idB],['qa:1','qa:2'],'qa-doc','rev-1'),true,
  'literal decimal string page 1 remains compatible');
for(const bad of [
  [idA], [idA,idA], [idA,idB,{...idB,id:'qa:3'}],
  [idA,{...idB,metadata:{...idB.metadata,sourceFingerprint:'rev-old'}}],
  [idA,{...idB,metadata:{...idB.metadata,sourceFileId:'other-doc'}}],
  [idA,{...idB,metadata:{...idB.metadata,page:2}}],
  ...[true,[1],'1e0','1.0',' 1 ',{value:1}].map(page =>
    [idA,{...idB,metadata:{...idB.metadata,page}}]),
  [idA,{...idB,metadata:null}],
]) assert.equal(hasExactQaVectorReadback(bad,['qa:1','qa:2'],'qa-doc','rev-1'),false,
  'missing, duplicate, extra, stale or mismatched metadata must fail readback');
assert.equal(hasExactQaVectorReadback([idA,idB],['qa:1','qa:1'],'qa-doc','rev-1'),false);
console.log('PASS: exact-head manual-only isolated actual-app QA with D1 mutation and Gemini opt-in; no cloud requests');
