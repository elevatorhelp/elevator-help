import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const [file,job,input] of [
  ['isolated-cloudflare-e2e.yml','test','allow_isolated_cloudflare_qa'],
  ['isolated-vectorize-test.yml','provision','allow_isolated_vectorize_provision'],
  ['qa-pr61-d1-restore.yml','restore','allow_remote_d1_qa'],
  ['qa-pr61-actual-app.yml','actual-app','allow_isolated_d1_mutation'],
]) {
  const yaml=readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
  const header=yaml.split(/^permissions:/m)[0];
  assert.match(header,/^on:\s*\r?\n  workflow_dispatch:/m,file+' must require manual dispatch');
  assert.doesNotMatch(header,/^  (?:push|pull_request|schedule|workflow_run|repository_dispatch):/m,file+' must never run automatically');
  const inputBlock=header.split('      '+input+':')[1]?.split(/^      [a-z_]+:/m)[0];
  assert.ok(inputBlock,file+' must declare '+input);
  assert.match(inputBlock,/type: boolean/);
  assert.match(inputBlock,/required: true/);
  assert.match(inputBlock,/default: false/);
  const expected="  "+job+":\n    if: ${{ github.event_name == 'workflow_dispatch' && inputs."+input+" == true }}";
  assert.ok(yaml.replaceAll('\r\n','\n').includes(expected),file+' must gate entire job');
  assert.match(yaml,/^concurrency:\s*\r?\n  group: qa-pr61-/m,file+' needs serialized QA concurrency');
}
// Protect against orphaned disposable D1 databases when provisioning succeeds
// remotely but the CLI exits nonzero before the next workflow step.
const d1=readFileSync(new URL('../.github/workflows/qa-pr61-d1-restore.yml',import.meta.url),'utf8');
const create=d1.indexOf('npx wrangler d1 create "$QA_DB"');
const intent=d1.indexOf('echo "QA_CREATED=true" >> "$GITHUB_ENV"');
const preexisting=d1.indexOf('QA_DATABASE_NAME_ALREADY_EXISTS');
assert.ok(preexisting>=0&&preexisting<intent&&intent<create,
  'D1 restore must reject pre-existing name and persist cleanup intent before create');
assert.match(d1,/if: always\(\)/,'D1 cleanup must run even after a failed provision/restore');
assert.match(d1,/qa-pr61-restore-\$\{GITHUB_RUN_ID\}/,
  'D1 cleanup must constrain deletion to the current run-specific name');
assert.match(d1,/list=\$\(npx wrangler d1 list --json\)/,
  'D1 cleanup must check resource existence before deletion');
console.log('PASS: isolated Cloudflare, actual-app D1, restore D1 and Vectorize writes require opt-in; D1 failed-create cleanup is guarded');
