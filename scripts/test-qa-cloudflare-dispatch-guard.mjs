import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const [file,job,input] of [
  ['isolated-cloudflare-e2e.yml','test','allow_isolated_cloudflare_qa'],
  ['isolated-vectorize-test.yml','provision','allow_isolated_vectorize_provision'],
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
console.log('PASS: isolated Cloudflare writes and Vectorize provisioning are manual-only, opt-in and serialized');
