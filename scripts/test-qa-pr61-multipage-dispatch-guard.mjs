import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml', import.meta.url), 'utf8');
const trigger = workflow.split(/^permissions:/m)[0];
assert.match(trigger, /^on:\s*\r?\n  workflow_dispatch:/m, 'workflow must be manually dispatched');
assert.doesNotMatch(trigger, /^  (?:push|pull_request|schedule|workflow_run):/m, 'no automatic cloud/paid QA trigger');
assert.match(trigger, /allow_paid_qa:[\s\S]*?type: boolean[\s\S]*?required: true[\s\S]*?default: false/, 'paid QA must require an explicit false-by-default boolean');

const blocks = workflow.split(/^      - name: /m).slice(1);
const byName = new Map(blocks.map((block) => [block.split(/\r?\n/, 1)[0].trim(), block]));
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
console.log('PASS: manual-only, explicit opt-in, all remote QA steps fail closed by default');
