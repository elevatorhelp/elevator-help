import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../wrangler.qa-app.json',import.meta.url),'utf8'));
const runner=readFileSync(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');
assert.match(workflow,/^  workflow_dispatch:/m,'actual-app cloud QA must be manually dispatched');
assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m,'no automatic cloud QA triggers');
assert.match(workflow,/allow_isolated_d1_mutation:[\s\S]*?required: true[\s\S]*?default: false/,'existing isolated D1 mutation must require explicit opt-in');
assert.ok(workflow.includes("    if: ${{ github.event_name == 'workflow_dispatch' && inputs.allow_isolated_d1_mutation == true }}"),'actual-app entire job must be gated before D1 bootstrap');
assert.match(workflow,/allow_paid_gemini:[\s\S]*?default: false/,'Gemini spending must be explicitly opted into');
assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/,'must check out the dispatched exact SHA');
assert.match(workflow,/\$GITHUB_EVENT_NAME.*workflow_dispatch/,'paid path must require manual event');
assert.match(workflow,/ALLOW_PAID_GEMINI:-false/,'paid path must fail closed');
assert.match(workflow,/qa-pr61-ensure-lease-schema\.mjs/,'isolated D1 lease schema reconciliation required');
// Lockfile fidelity: no second mutable npm resolution after npm ci.
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const packageLock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const locked=packageLock.packages[''];
assert.equal(packageJson.devDependencies['@opennextjs/cloudflare'],'1.20.12');
assert.equal(locked.devDependencies['@opennextjs/cloudflare'],'1.20.12');
assert.equal(packageJson.dependencies.next,'16.4.2');
assert.equal(locked.dependencies.next,'16.4.2');
assert.match(workflow,/run: npm ci/,'QA must install exactly from the lockfile');
assert.doesNotMatch(workflow,/npm install\\b|npm update\\b/,'no mutable dependency resolution after npm ci');
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
console.log('PASS: exact-head manual-only isolated actual-app QA with D1 mutation and Gemini opt-in; no cloud requests');
