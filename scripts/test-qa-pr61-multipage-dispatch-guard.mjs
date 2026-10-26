import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml', import.meta.url), 'utf8');
const trigger = workflow.split(/^permissions:/m)[0];
assert.match(trigger, /^on:\s*\r?\n  workflow_dispatch:/m, 'workflow must be manually dispatched');
assert.doesNotMatch(trigger, /^  (?:push|pull_request|schedule|workflow_run):/m, 'no automatic cloud/paid QA trigger');
assert.match(trigger, /allow_paid_qa:[\s\S]*?type: boolean[\s\S]*?required: true[\s\S]*?default: false/, 'paid QA must require an explicit false-by-default boolean');

assert.match(workflow, /^  isolated-app:\r?\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.allow_paid_qa == true \}\}/m,
  'entire multipage QA job must fail closed without explicit owner authorization');

const blocks = workflow.split(/^      - name: /m).slice(1);
const byName = new Map(blocks.map((block) => [block.split(/\r?\n/, 1)[0].trim(), block]));
const preflight = byName.get('Preflight isolated QA credentials before consuming build quota');
const install = byName.get('Install');
const secretCheck = byName.get('Verify Cloudflare secret presence without reading values');
assert.ok(preflight && install && secretCheck, 'multipage QA must preflight required credentials and check Gemini');
assert.ok(blocks.indexOf('Preflight isolated QA credentials before consuming build quota') === -1 || preflight, 'preflight must exist');
assert.ok(workflow.indexOf('      - name: Preflight isolated QA credentials before consuming build quota') <
  workflow.indexOf('      - name: Install'), 'preflight must run before npm install and build quota');
for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON']) {
  assert.match(preflight, new RegExp('test -n "\\
  'Create QA-only D1 tables',
  'Deploy protected QA Worker and inject disposable auth token only',
  'Verify Cloudflare secret presence without reading values',
  'Test real deployed application',
  'Real multi-page Drive interruption and same-generation checkpoint resume (isolated only)',
  'Verify real Drive document exact retrieval and citation',
  'Verify interrupted publication and stale owner recovery',
];
for (const name of remoteSteps) {
  const block = byName.get(name);
  assert.ok(block, `missing QA remote step: ${name}`);
  assert.match(block, /^\s*if: \$\{\{ inputs\.allow_paid_qa == true(?: && | \}\})/m, `unguarded QA remote step: ${name}`);
}
for (const name of remoteSteps.slice(4)) {
  assert.match(byName.get(name), /steps\.secret-check\.outputs\.positive == 'true'/, `missing positive-test secret gate: ${name}`);
}
const approvedQaOrigin = 'https://elevator-help-pr61-app-qa.baharmand.workers.dev';
const deployment = byName.get('Deploy protected QA Worker and inject disposable auth token only');
const multipage = byName.get('Real multi-page Drive interruption and same-generation checkpoint resume (isolated only)');
assert.ok(deployment && multipage, 'deployed QA origin and Drive recovery must both be present');
assert.ok(deployment.includes('if [ "$QA_APP_BASE_URL" != "' + approvedQaOrigin + '" ]'), 'deploy output must match approved isolated QA origin');
assert.ok(multipage.includes('test "$QA_APP_BASE_URL" = "' + approvedQaOrigin + '"'), 'Drive recovery must fail closed on unexpected QA origin');
assert.doesNotMatch(multipage, /(?:INGEST_ENDPOINT|DOCUMENT_MAP_ENDPOINT):\s*https?:\/\//, 'do not hardcode a possibly stale or unrelated QA Worker endpoint');
assert.ok(multipage.includes('export INGEST_ENDPOINT="$QA_APP_BASE_URL/api/drive-ingest-batch"'), 'Drive RAW endpoint must follow the verified deployment');
assert.ok(multipage.includes('export DOCUMENT_MAP_ENDPOINT="$QA_APP_BASE_URL/api/document-map-ingest"'), 'Drive Map endpoint must follow the verified deployment');
console.log('PASS: multipage recovery targets only the exact verified freshly deployed isolated Worker');

console.log('PASS: manual-only, explicit opt-in, all remote QA steps fail closed by default');


const restoreWorkflow = readFileSync(new URL('../.github/workflows/qa-pr61-d1-restore.yml', import.meta.url), 'utf8');
const restoreTrigger = restoreWorkflow.split(/^permissions:/m)[0];
assert.match(restoreTrigger, /^on:\s*\r?\n  workflow_dispatch:/m, 'remote D1 restore must be manual');
assert.doesNotMatch(restoreTrigger, /^  (?:push|pull_request|schedule|workflow_run):/m, 'remote D1 restore must never auto-run');
assert.match(restoreTrigger, /allow_remote_d1_qa:[\s\S]*?type: boolean[\s\S]*?required: true[\s\S]*?default: false/, 'D1 restore must require explicit false-by-default opt-in');
assert.match(restoreWorkflow, /^  restore:\r?\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.allow_remote_d1_qa == true \}\}/m, 'entire D1 restore job must fail closed');
console.log('PASS: disposable remote D1 restore is manual-only and gated');
 + key + '"'), 'missing fail-closed QA prerequisite: ' + key);
}
assert.match(secretCheck, /GEMINI_API_KEY absent[\s\S]*?exit 1/, 'missing Gemini secret must fail the job, not silently skip positive Drive QA');
const remoteSteps = [
  'Create QA-only D1 tables',
  'Deploy protected QA Worker and inject disposable auth token only',
  'Verify Cloudflare secret presence without reading values',
  'Test real deployed application',
  'Real multi-page Drive interruption and same-generation checkpoint resume (isolated only)',
  'Verify real Drive document exact retrieval and citation',
  'Verify interrupted publication and stale owner recovery',
];
for (const name of remoteSteps) {
  const block = byName.get(name);
  assert.ok(block, `missing QA remote step: ${name}`);
  assert.match(block, /^\s*if: \$\{\{ inputs\.allow_paid_qa == true(?: && | \}\})/m, `unguarded QA remote step: ${name}`);
}
for (const name of remoteSteps.slice(4)) {
  assert.match(byName.get(name), /steps\.secret-check\.outputs\.positive == 'true'/, `missing positive-test secret gate: ${name}`);
}
const approvedQaOrigin = 'https://elevator-help-pr61-app-qa.baharmand.workers.dev';
const deployment = byName.get('Deploy protected QA Worker and inject disposable auth token only');
const multipage = byName.get('Real multi-page Drive interruption and same-generation checkpoint resume (isolated only)');
assert.ok(deployment && multipage, 'deployed QA origin and Drive recovery must both be present');
assert.ok(deployment.includes('if [ "$QA_APP_BASE_URL" != "' + approvedQaOrigin + '" ]'), 'deploy output must match approved isolated QA origin');
assert.ok(multipage.includes('test "$QA_APP_BASE_URL" = "' + approvedQaOrigin + '"'), 'Drive recovery must fail closed on unexpected QA origin');
assert.doesNotMatch(multipage, /(?:INGEST_ENDPOINT|DOCUMENT_MAP_ENDPOINT):\s*https?:\/\//, 'do not hardcode a possibly stale or unrelated QA Worker endpoint');
assert.ok(multipage.includes('export INGEST_ENDPOINT="$QA_APP_BASE_URL/api/drive-ingest-batch"'), 'Drive RAW endpoint must follow the verified deployment');
assert.ok(multipage.includes('export DOCUMENT_MAP_ENDPOINT="$QA_APP_BASE_URL/api/document-map-ingest"'), 'Drive Map endpoint must follow the verified deployment');
console.log('PASS: multipage recovery targets only the exact verified freshly deployed isolated Worker');

console.log('PASS: manual-only, explicit opt-in, all remote QA steps fail closed by default');


const restoreWorkflow = readFileSync(new URL('../.github/workflows/qa-pr61-d1-restore.yml', import.meta.url), 'utf8');
const restoreTrigger = restoreWorkflow.split(/^permissions:/m)[0];
assert.match(restoreTrigger, /^on:\s*\r?\n  workflow_dispatch:/m, 'remote D1 restore must be manual');
assert.doesNotMatch(restoreTrigger, /^  (?:push|pull_request|schedule|workflow_run):/m, 'remote D1 restore must never auto-run');
assert.match(restoreTrigger, /allow_remote_d1_qa:[\s\S]*?type: boolean[\s\S]*?required: true[\s\S]*?default: false/, 'D1 restore must require explicit false-by-default opt-in');
assert.match(restoreWorkflow, /^  restore:\r?\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.allow_remote_d1_qa == true \}\}/m, 'entire D1 restore job must fail closed');
console.log('PASS: disposable remote D1 restore is manual-only and gated');
