import assert from 'node:assert/strict';
import {hasExactQaVectorReadback} from './qa-pr61-vector-readback.mjs';
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
assert.ok(runner.includes('import {parseQaDriveRecoveryResponse} from "./qa-drive-recovery-response.mjs";'),
  'actual-app QA must import the HTTP-authoritative response parser');
assert.ok(runner.includes('return parseQaDriveRecoveryResponse(response);'),
  'actual-app QA must preserve real HTTP status over untrusted body fields');
assert.ok(!runner.includes('return {status:response.status,...data};'),
  'body status must not override real HTTP status');
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
// Positive multipage QA must verify the exact page for each ID, not assume page 1.
const idBPage2={...idB,metadata:{...idB.metadata,page:2}};
const idCPage3={id:'qa:3',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:3}};
const pageMap=new Map([['qa:1',1],['qa:2',2],['qa:3',3]]);
assert.equal(hasExactQaVectorReadback([idCPage3,idA,idBPage2],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),true);
assert.equal(hasExactQaVectorReadback([idA,{...idBPage2,metadata:{...idBPage2.metadata,page:'2'}},idCPage3],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),true);
assert.equal(hasExactQaVectorReadback([idA,idBPage2],['qa:1','qa:2'],'qa-doc','rev-1'),false,
  'legacy page-1-only calls must not silently accept page 2');
for (const badPages of [
  new Map([['qa:1',1],['qa:2',2]]),
  new Map([['qa:1',1],['qa:2',1],['qa:3',3]]),
  new Map([['qa:1',1],['qa:2',2],['qa:3',0]]),
  new Map([['qa:1',1],['qa:2','2'],['qa:3',3]]),
  new Map([['qa:1',1],['qa:2',2],['wrong',3]]),
]) assert.equal(hasExactQaVectorReadback([idA,idBPage2,idCPage3],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',badPages),false,
  'missing, extra, invalid or mismatched page mappings must fail closed');
for (const badPage of [true,2.5,'02','2.0',' 2 ',null,0]) {
  const bad={...idBPage2,metadata:{...idBPage2.metadata,page:badPage}};
  assert.equal(hasExactQaVectorReadback([idA,bad,idCPage3],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),false,
    'malformed or incorrect physical page must fail readback');
}
assert.equal(hasExactQaVectorReadback([idA,idBPage2,{...idCPage3,metadata:{...idCPage3.metadata,sourceFingerprint:'stale'}}],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),false);
assert.ok(runner.includes('page:2,chunkIndex:1,sourceFingerprint:fp'),
  'actual-app positive E2E must stage a real second physical page');
assert.ok(runner.includes('new Map([[doc+":1",1],[doc+":2",2]])'),
  'actual-app E2E must specify each expected page');
assert.ok(runner.includes('hasExactQaVectorReadback(records,expectedIds,doc,fp,expectedPages)'),
  'actual-app E2E must verify both physical Vectorize indices against the page manifest');
console.log('PASS: exact-head manual-only isolated actual-app QA with D1 mutation and Gemini opt-in; no cloud requests');
