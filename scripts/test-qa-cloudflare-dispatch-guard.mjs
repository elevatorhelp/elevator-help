import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const [file,job,input] of [
  ['isolated-cloudflare-e2e.yml','test','allow_isolated_cloudflare_qa'],
  ['isolated-vectorize-test.yml','provision','allow_isolated_vectorize_provision'],
  ['qa-pr61-d1-restore.yml','restore','allow_remote_d1_qa'],
  ['qa-pr61-actual-app.yml','actual-app','allow_isolated_d1_mutation'],
  ['qa-pr61-prod-recovery-readonly.yml','inspect','allow_production_d1_readonly'],
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
// Two separate physical QA indices are required to validate the production
// legacy/multilingual recovery contract. A single shared test index can mask
// partial publication or recovery failure in the second index.
const qaIndices=['elevator-help-staging-test','elevator-help-staging-test-v2'];
for(const file of ['wrangler.qa-app.json','wrangler.qa-staged.json','wrangler.qa-app-deployed.json']){
  const config=JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  assert.deepEqual(Object.fromEntries(config.vectorize.map(x=>[x.binding,x.index_name])),{
    VECTORIZE:qaIndices[0],VECTORIZE_V2:qaIndices[1],
  },file+' must not alias the legacy and multilingual QA bindings');
}
const vectorProvision=readFileSync(new URL('../.github/workflows/isolated-vectorize-test.yml',import.meta.url),'utf8');
assert.match(vectorProvision,/for index in elevator-help-staging-test elevator-help-staging-test-v2;/,
  'manual QA provisioning must cover both physical indices');
assert.match(vectorProvision,/rows\.length\+missing\.length>8/,
  'preflight must reserve quota for BOTH missing QA indices before creating either');
assert.match(vectorProvision,/new Set\(rows\.map\(x=>x\.name\)\)\.size!==rows\.length/,
  'preflight must reject duplicate or ambiguous index identities');
assert.match(vectorProvision,/Number\(match\.dimensions\)!==768/,
  'existing QA indices must have verified dimensions');
assert.match(vectorProvision,/match\.metric!=="cosine"/,
  'existing QA indices must have verified cosine metric');
assert.doesNotMatch(vectorProvision,/dimensions\?\?768/,
  'missing dimension metadata must not silently pass as 768');
assert.doesNotMatch(vectorProvision,/elevator-help-index|elevator-help-multilingual-v2/,
  'isolated provisioning must never address production index names');
const readback=readFileSync(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');
assert.match(readback,/const qaIndexes=\["elevator-help-staging-test","elevator-help-staging-test-v2"\]/,
  'actual-app QA must read both physical indices');
assert.match(readback,/assert\.equal\(pending\.size,0/,
  'actual-app QA must fail if either physical index lacks vectors');

console.log('PASS: isolated Cloudflare writes and production D1 read-only inspection require explicit manual opt-in; D1 cleanup and dual-Vectorize bindings guarded');
