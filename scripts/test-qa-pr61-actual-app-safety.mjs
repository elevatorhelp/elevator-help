import assert from 'node:assert/strict';
import {approvedQaVectorizeTargets,safeQaIndexLookupResult} from './qa-pr61-verify-vectorize-readonly.mjs';
import {classifyQaWorkerStartup,safeQaWorkerStartupMessage} from './qa-pr61-classify-startup.mjs';
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
// Metadata-only Cloudflare preflight must be part of a manual-only QA run, and
// must finish BEFORE the first remote D1 write. No source/data readback here.
const metadataGate=workflow.indexOf('node scripts/qa-pr61-verify-vectorize-readonly.mjs');
const qaWrite=workflow.indexOf('npx wrangler d1 execute elevator-help-lease-test-01');
const guard=workflow.indexOf('node scripts/qa-pr61-assert-isolated-config.mjs');
assert.ok(guard>=0 && metadataGate>guard && qaWrite>metadataGate,
  'safe metadata-only Vectorize index check must precede all remote QA writes');
assert.ok(workflow.includes('allow_paid_gemini') && workflow.includes('default: false'),
  'metadata preflight must not change paid opt-in');
const approvedIndexes=approvedQaVectorizeTargets(config);
assert.deepEqual(approvedIndexes.map(x=>x.tag),['LEGACY','MULTILINGUAL']);
assert.deepEqual(approvedIndexes.map(x=>x.index_name),
 ['elevator-help-staging-test','elevator-help-staging-test-v2']);
for(const invalid of [
  {...config,vectorize:[config.vectorize[0]]},
  {...config,vectorize:[...config.vectorize].reverse()},
  {...config,name:'unapproved-worker'},
  {...config,vectorize:config.vectorize.map((x,i)=>i===1?{...x,index_name:'another-index'}:x)},
]) assert.throws(()=>approvedQaVectorizeTargets(invalid),/QA_VECTORIZE_CONFIG_NOT_APPROVED/,
 'unreviewed QA resources must fail closed');
assert.equal(safeQaIndexLookupResult('LEGACY',0),'QA_VECTORIZE_LEGACY_METADATA_OK');
assert.equal(safeQaIndexLookupResult('MULTILINGUAL',1),'QA_VECTORIZE_MULTILINGUAL_LOOKUP_FAILED');
assert.throws(()=>safeQaIndexLookupResult('SECRET',1),/QA_VECTORIZE_INVALID_TAG/);

// Diagnostic categories must reveal only fixed labels, even when Wrangler logs
// contain arbitrary URLs, bearer tokens, document text or credentials.
assert.match(workflow,/node scripts\/qa-pr61-classify-startup\.mjs \/tmp\/qa-app-worker\.log/,
  'failed remote Worker startup must emit safe fixed-category diagnostics');
assert.equal(classifyQaWorkerStartup('Error: invalid API token'), 'CLOUDFLARE_AUTH_OR_PERMISSION');
assert.equal(classifyQaWorkerStartup('remote preview is not supported'), 'REMOTE_PREVIEW_UNAVAILABLE');
assert.equal(classifyQaWorkerStartup('Error: Vectorize binding not found'), 'QA_RESOURCE_OR_BINDING');
assert.equal(classifyQaWorkerStartup('connect ECONNREFUSED'), 'NETWORK_OR_PREVIEW_CONNECTION');
assert.equal(classifyQaWorkerStartup('Error: EADDRINUSE'), 'LOCAL_PORT_CONFLICT');
assert.equal(classifyQaWorkerStartup(''), 'LOG_EMPTY');
const secretBearingLog='Error: request failed for https://private.example/?token=MY_SECRET and Authorization: Bearer MY_SECRET';
const sanitizedDiagnostic=safeQaWorkerStartupMessage(secretBearingLog);
assert.match(sanitizedDiagnostic,/^::error::QA_WORKER_STARTUP_[A-Z_]+ \(raw Wrangler diagnostics withheld/);
for(const secret of ['MY_SECRET','private.example','Authorization','Bearer','https://'])
  assert.ok(!sanitizedDiagnostic.includes(secret), 'startup diagnostic must never echo log text');

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
const idA={id:'qa:1',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:1,status:'active',text:'QA source page one',fileName:'qa.pdf',sourcePath:'qa/test',chunkIndex:0,contentType:'general'}};
const idB={id:'qa:2',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:1,status:'active',text:'QA source page two',fileName:'qa.pdf',sourcePath:'qa/test',chunkIndex:1,contentType:'general'}};
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
  // Regression: ID, fingerprint and page alone do not prove a usable citation.
  ...[
    {status:'deleted'}, {status:undefined}, {text:'  '}, {text:null},
    {fileName:''}, {sourcePath:null}, {chunkIndex:-1},
    {chunkIndex:'1'}, {contentType:'document-map'},
  ].map(invalid => [idA,{...idB,metadata:{...idB.metadata,...invalid}}]),
]) assert.equal(hasExactQaVectorReadback(bad,['qa:1','qa:2'],'qa-doc','rev-1'),false,
  'missing, duplicate, extra, stale or mismatched metadata must fail readback');
assert.equal(hasExactQaVectorReadback([idA,idB],['qa:1','qa:1'],'qa-doc','rev-1'),false);
// Positive multipage QA must verify the exact page for each ID, not assume page 1.
const idBPage2={...idB,metadata:{...idB.metadata,page:2}};
const idCPage3={id:'qa:3',metadata:{sourceFileId:'qa-doc',sourceFingerprint:'rev-1',page:3,status:'active',text:'QA source page three',fileName:'qa.pdf',sourcePath:'qa/test',chunkIndex:0,contentType:'general'}};
const pageMap=new Map([['qa:1',1],['qa:2',2],['qa:3',3]]);
assert.equal(hasExactQaVectorReadback([idCPage3,idA,idBPage2],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),true);
assert.equal(hasExactQaVectorReadback([idA,{...idBPage2,metadata:{...idBPage2.metadata,page:'2'}},idCPage3],['qa:1','qa:2','qa:3'],'qa-doc','rev-1',pageMap),true);
assert.equal(hasExactQaVectorReadback([idA,idBPage2],['qa:1','qa:2'],'qa-doc','rev-1'),false,
  'legacy page-1-only calls must not silently accept page 2');
// Reproduce the real API contract: staged upsert returns g<generation>:<id>,
// while the publish_staged manifest still contains original unprefixed IDs.
const stagedA={...idA,id:'g1:qa:1'};
const stagedB={...idBPage2,id:'g1:qa:2'};
const stagedIds=['g1:qa:1','g1:qa:2'];
const stagedPages=new Map([['g1:qa:1',1],['g1:qa:2',2]]);
assert.equal(hasExactQaVectorReadback([stagedA,stagedB],stagedIds,'qa-doc','rev-1',stagedPages),true,
  'generation-qualified staged vectors must pass exact two-page readback');
assert.equal(hasExactQaVectorReadback([stagedA,stagedB],stagedIds,'qa-doc','rev-1',
  new Map([['qa:1',1],['qa:2',2]])),false,
  'raw receipt IDs cannot key staged Vectorize readback pages');
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
assert.ok(runner.includes('const expectedStagedIds=originalIds.map(id=>`g${lease.generation}:${id}`);'),
  'actual-app E2E must expect generation-qualified IDs returned by staged upsert');
assert.ok(runner.includes('new Set(actualStagedIds),new Set(expectedStagedIds)'),
  'actual-app E2E must verify the returned IDs match the lease generation');
assert.ok(runner.includes('new Map([[expectedStagedIds[0],1],[expectedStagedIds[1],2]])'),
  'actual-app E2E must map physical pages by the staged IDs returned by the route');
assert.ok(runner.includes('hasExactQaVectorReadback(records,expectedIds,doc,fp,expectedPages)'),
  'actual-app E2E must verify both physical Vectorize indices against the page manifest');
// Both manual QA workflows mutate the same isolated D1 and two Vectorize indices.
const multipageWorkflow=readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml',import.meta.url),'utf8');
const expectedGroup=['concurrency:','  group: qa-pr61-isolated-d1-mutating','  cancel-in-progress: false'].join(String.fromCharCode(10));
for (const [name, yaml] of [['actual-app',workflow],['multipage',multipageWorkflow]]) {
  assert.ok(yaml.includes(expectedGroup),
    name+' must serialize shared QA resources without canceling an active run');
  const guard=yaml.indexOf('node scripts/qa-pr61-assert-isolated-config.mjs');
  const firstMutation=yaml.indexOf('npx wrangler d1 execute elevator-help-lease-test-01');
  assert.ok(guard>=0 && firstMutation>guard,
    name+' must validate exact isolated resources before remote D1 mutation');
}
assert.ok(multipageWorkflow.includes('ref: ${{ github.sha }}'),
  'multipage QA must check out the exact triggering commit');
assert.ok(!multipageWorkflow.includes(' | tee /tmp/qa61-deploy.log'),
  'multipage QA must not print raw Wrangler deploy logs to Actions');
console.log('PASS: exact-head manual-only isolated actual-app QA checks active RAW source-page provenance in both indices; no cloud requests');
